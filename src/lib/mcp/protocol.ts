/**
 * The MCP wire protocol: versions, framing, and the header/body agreement.
 *
 * Pure: no database, no network. MCP has two eras living at once and a
 * public endpoint has to answer both. Legacy (2025-11-25 and earlier) opens
 * with `initialize`; modern (2026-07-28) has no handshake and every request
 * carries its version and identity in `params._meta`, mirrored into HTTP
 * headers. A stateless server decides per request which it is looking at.
 * Ported from rssamplifier.com, which serves the same shape.
 */

export const MODERN_VERSIONS = ["2026-07-28"];
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const SUPPORTED_VERSIONS = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];
export const DEFAULT_LEGACY_VERSION = "2025-11-25";
export const META_VERSION = "io.modelcontextprotocol/protocolVersion";
export const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

export const ERRORS = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  HEADER_MISMATCH: -32020,
  UNSUPPORTED_VERSION: -32022,
  RESOURCE_NOT_FOUND: -32002,
} as const;

export type Id = string | number | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Message = any;

export function rpcError(code: number, message: string): Error & { rpcCode: number } {
  return Object.assign(new Error(message), { rpcCode: code });
}

/** A tool ran and could not do what was asked; shown to the model, not thrown to the transport. */
export function toolError(message: string): Error & { toolError: true } {
  return Object.assign(new Error(message), { toolError: true as const });
}

const NAME_SOURCE: Record<string, (params: Message) => unknown> = {
  "tools/call": (params) => params?.name,
  "prompts/get": (params) => params?.name,
  "resources/read": (params) => params?.uri,
};

export function ok(id: Id, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

export function fail(id: Id, code: number, message: string, data?: unknown) {
  const error = data === undefined ? { code, message } : { code, message, data };
  return { jsonrpc: "2.0", id: id ?? null, error };
}

export function era(message: Message): "modern" | "legacy" {
  const method = message?.method;
  if (method === "initialize" || method === "notifications/initialized") return "legacy";
  return message?.params?._meta?.[META_VERSION] ? "modern" : "legacy";
}

export function decodeHeaderValue(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw);
  if (!value.startsWith("=?base64?") || !value.endsWith("?=")) return value;
  try {
    return Buffer.from(value.slice(9, -2), "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** A modern request's headers must say what its body says; legacy clients send none. */
export function checkHeaders(message: Message, header: (name: string) => string | null) {
  const stated = message?.params?._meta?.[META_VERSION];
  const version = header("mcp-protocol-version");
  if (!version) return { code: ERRORS.HEADER_MISMATCH, message: "Missing MCP-Protocol-Version header" };
  if (version !== stated) {
    return { code: ERRORS.HEADER_MISMATCH, message: `Header mismatch: MCP-Protocol-Version '${version}' does not match body value '${stated}'` };
  }
  const method = header("mcp-method");
  if (!method) return { code: ERRORS.HEADER_MISMATCH, message: "Missing Mcp-Method header" };
  if (method !== message?.method) {
    return { code: ERRORS.HEADER_MISMATCH, message: `Header mismatch: Mcp-Method '${method}' does not match body value '${message?.method}'` };
  }
  const source = NAME_SOURCE[String(message?.method)];
  if (source) {
    const expected = source(message?.params);
    const name = decodeHeaderValue(header("mcp-name"));
    if (name === null) return { code: ERRORS.HEADER_MISMATCH, message: "Missing Mcp-Name header" };
    if (name !== expected) {
      return { code: ERRORS.HEADER_MISMATCH, message: `Header mismatch: Mcp-Name '${name}' does not match body value '${expected}'` };
    }
  }
  return null;
}

export function modernVersion(message: Message): { version: string } | { unsupported: string } {
  const requested = String(message?.params?._meta?.[META_VERSION] ?? "");
  if (MODERN_VERSIONS.includes(requested)) return { version: requested };
  return { unsupported: requested };
}

/** The same version back if we speak it, else our newest: a legacy client cannot ask twice. */
export function negotiate(requested: unknown): string {
  const asked = String(requested ?? "");
  return LEGACY_VERSIONS.includes(asked) ? asked : DEFAULT_LEGACY_VERSION;
}

export function unsupportedVersion(id: Id, requested: string) {
  return fail(id, ERRORS.UNSUPPORTED_VERSION, "Unsupported protocol version", { supported: SUPPORTED_VERSIONS, requested });
}
