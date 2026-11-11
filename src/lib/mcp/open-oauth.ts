/**
 * Open OAuth for the MCP endpoint: a sign-in that lets everyone in.
 *
 * /api/mcp needs no credential, but claude.ai's connector flow runs OAuth
 * discovery and dynamic client registration even for a server marked "no
 * auth" (dev2 nginx, 2026-11-11: POST /api/mcp 200, then the three
 * .well-known lookups and POST /register, all 404 -> "Couldn't register with
 * p0dcasters's sign-in service"). So the site answers every step of that
 * dance and grants nothing by it:
 *
 *   register   any client, stateless, client_id is random
 *   authorize  no login, no consent page: straight back to redirect_uri with
 *              a code (https, or http on loopback, only -- never javascript:)
 *   token      honours PKCE S256 when the code carries a challenge, then hands
 *              out an opaque `open_` token that unlocks nothing
 *
 * The token is not an OpenAccess token, so bearerPrincipal() resolves it to
 * null: the public tools ignore it and the review and profile tools still
 * refuse without a real OpenAccess grant. Pure apart from crypto.
 */

export const ISSUER = "https://p0dcasters.com";
export const RESOURCE = `${ISSUER}/api/mcp`;
const BASE = `${ISSUER}/api/v1/mcp/oauth`;
const CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_S = 30 * 24 * 60 * 60;

export function protectedResourceMetadata() {
  return {
    resource: RESOURCE,
    authorization_servers: [ISSUER],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
    resource_name: "p0dcasters",
    resource_documentation: `${ISSUER}/mcp`,
  };
}

export function authorizationServerMetadata() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${BASE}/authorize`,
    token_endpoint: `${BASE}/token`,
    registration_endpoint: `${BASE}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["mcp"],
    service_documentation: `${ISSUER}/mcp`,
  };
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = (n = 24) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const encode = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
function decode<T>(s: string): T | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as T;
  } catch {
    return null;
  }
}

/** https anywhere, or http on loopback (desktop clients). Nothing else. */
export function safeRedirect(uri: unknown): URL | null {
  if (typeof uri !== "string") return null;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return null;
  }
  if (u.protocol === "https:") return u;
  if (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return u;
  return null;
}

type Json = Record<string, unknown>;
type Answer = { status: number; body: Json };

export function register(meta: Json): Answer {
  const uris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris : [];
  if (uris.length === 0 || !uris.every((u) => safeRedirect(u))) {
    return { status: 400, body: { error: "invalid_redirect_uri", error_description: "redirect_uris must be https, or http on localhost" } };
  }
  const method = typeof meta.token_endpoint_auth_method === "string" ? meta.token_endpoint_auth_method : "none";
  const body: Json = {
    ...meta,
    client_id: `open_${random(12)}`,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: uris,
    token_endpoint_auth_method: method,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
  if (method !== "none") {
    body.client_secret = random(24);
    body.client_secret_expires_at = 0;
  }
  return { status: 201, body };
}

type Code = { ru: string; cc?: string; exp: number };

/** The redirect for GET /authorize, or an error when there is nowhere safe to send one. */
export function authorize(params: URLSearchParams): { location: string } | Answer {
  const target = safeRedirect(params.get("redirect_uri"));
  if (!target) return { status: 400, body: { error: "invalid_request", error_description: "redirect_uri must be https, or http on localhost" } };
  const state = params.get("state");
  const back = (q: Record<string, string>) => {
    for (const [k, v] of Object.entries(q)) target.searchParams.set(k, v);
    if (state) target.searchParams.set("state", state);
    return { location: target.toString() };
  };
  if (params.get("response_type") !== "code") return back({ error: "unsupported_response_type" });
  const method = params.get("code_challenge_method") ?? "S256";
  if (params.get("code_challenge") && method !== "S256") return back({ error: "invalid_request", error_description: "S256 only" });
  const code: Code = { ru: params.get("redirect_uri") as string, exp: Date.now() + CODE_TTL_MS };
  const cc = params.get("code_challenge");
  if (cc) code.cc = cc;
  return back({ code: `${encode(code)}.${random(8)}`, iss: ISSUER });
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

function tokens(): Json {
  return {
    access_token: `open_${random(24)}`,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_S,
    refresh_token: `open_r_${random(24)}`,
    scope: "mcp",
  };
}

export async function token(form: URLSearchParams): Promise<Answer> {
  const grant = form.get("grant_type");
  if (grant === "refresh_token") {
    if (!form.get("refresh_token")) return { status: 400, body: { error: "invalid_request" } };
    return { status: 200, body: tokens() };
  }
  if (grant !== "authorization_code") return { status: 400, body: { error: "unsupported_grant_type" } };
  const raw = form.get("code") ?? "";
  const code = decode<Code>(raw.split(".")[0] ?? "");
  if (!code || typeof code.exp !== "number" || code.exp < Date.now()) {
    return { status: 400, body: { error: "invalid_grant", error_description: "unknown or expired code" } };
  }
  const ru = form.get("redirect_uri");
  if (ru && ru !== code.ru) return { status: 400, body: { error: "invalid_grant", error_description: "redirect_uri mismatch" } };
  if (code.cc) {
    const verifier = form.get("code_verifier");
    if (!verifier || (await s256(verifier)) !== code.cc) {
      return { status: 400, body: { error: "invalid_grant", error_description: "PKCE verification failed" } };
    }
  }
  return { status: 200, body: tokens() };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

/** CORS preflight for the routes above (a 204 may not carry a body). */
export function preflight(): Response {
  const headers = json({}).headers;
  return new Response(null, { status: 204, headers });
}
