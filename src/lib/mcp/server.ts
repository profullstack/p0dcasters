import { SITE } from "@/lib/queries";
import {
  ERRORS,
  META_SERVER_INFO,
  SUPPORTED_VERSIONS,
  checkHeaders,
  era,
  fail,
  modernVersion,
  negotiate,
  ok,
  rpcError,
  unsupportedVersion,
  type Message,
} from "./protocol";
import { TOOLS, TOOLS_BY_NAME, describe, type ToolContext } from "./tools";

/**
 * The MCP server: one JSON-RPC message in, one answer out. Stateless by
 * construction, which is what lets it serve both eras of the protocol without
 * a session table and run on the same web service as the site.
 */

export const SERVER_INFO = { name: "p0dcasters", title: "p0dcasters", version: "1.0.0" };
export const CAPABILITIES = { tools: {}, resources: {} };

export const INSTRUCTIONS = [
  "p0dcasters is a directory of podcasts that publish from their creator's own domain",
  "rather than from a hosting platform. Shows on Spotify, Anchor, Buzzsprout, Libsyn and",
  "the other large hosts are excluded by design, so a mainstream show will usually be",
  "absent and its absence says nothing about it. No key, no account, no rate card.",
  "",
  "Start with `search` for a subject you can name, or `browse` for the categories and",
  "languages that exist and then `list_shows`. `get_podcast` reads one show; `list_episodes`",
  "reads its episodes live from the publisher's feed, which is the one slow call here.",
  "`directory_stats` gives the totals and the OPML export for taking everything at once.",
  "",
  "`submit_feed` adds a show. A site URL is enough: the feed is found from the page,",
  "checked against the rules (audio episodes, its own domain, an episode inside 90 days)",
  "and listed on the spot; a refusal names the rule. Anything on a platform belongs at",
  "rssamplifier.com instead, which takes every feed and is told about submissions here.",
].join("\n");

function resources() {
  return [
    {
      uri: `${SITE}/llms.txt`,
      name: "llms.txt",
      title: "The directory, described for language models",
      description: "What p0dcasters holds, how it is organised and every machine-readable endpoint it serves.",
      mimeType: "text/plain",
    },
  ];
}

export async function handle(message: Message, ctx: ToolContext): Promise<{ status: number; body: object | null }> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { status: 400, body: fail(null, ERRORS.INVALID_REQUEST, "Expected a JSON-RPC object") };
  }
  const id = message.id ?? null;
  const method = String(message.method ?? "");
  const isNotification = !("id" in message);
  if (!method) return { status: 400, body: fail(id, ERRORS.INVALID_REQUEST, "Missing method") };

  const modern = era(message) === "modern";
  if (modern) {
    const bad = checkHeaders(message, ctx.header);
    if (bad) return { status: 400, body: fail(id, bad.code, bad.message) };
    const version = modernVersion(message);
    if ("unsupported" in version) return { status: 400, body: unsupportedVersion(id, version.unsupported) };
  }
  if (isNotification) return { status: 202, body: null };

  try {
    const result = await dispatch(method, message.params ?? {}, ctx);
    if (result === UNKNOWN_METHOD) {
      return { status: modern ? 404 : 200, body: fail(id, ERRORS.METHOD_NOT_FOUND, `Method not found: ${method}`) };
    }
    return { status: 200, body: ok(id, result) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (err && typeof err === "object" && "rpcCode" in err) {
      return { status: 200, body: fail(id, Number((err as { rpcCode: number }).rpcCode), detail) };
    }
    return { status: 200, body: fail(id, ERRORS.INTERNAL, `Internal error: ${detail}`) };
  }
}

const UNKNOWN_METHOD = Symbol("unknown-method");

async function dispatch(method: string, params: Message, ctx: ToolContext): Promise<unknown> {
  switch (method) {
    case "server/discover":
      return {
        resultType: "complete",
        supportedVersions: SUPPORTED_VERSIONS,
        capabilities: CAPABILITIES,
        instructions: INSTRUCTIONS,
        ttlMs: 3_600_000,
        cacheScope: "public",
        _meta: { [META_SERVER_INFO]: SERVER_INFO },
      };
    case "initialize":
      return { protocolVersion: negotiate(params?.protocolVersion), capabilities: CAPABILITIES, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS };
    case "ping":
      return {};
    // Every list says it is whole: the current revision rejects one without resultType.
    case "tools/list":
      return { resultType: "complete", tools: TOOLS.map(describe) };
    case "tools/call":
      return callTool(params, ctx);
    case "resources/list":
      return { resultType: "complete", resources: resources() };
    case "resources/templates/list":
      return { resultType: "complete", resourceTemplates: [] };
    case "resources/read":
      return readResource(params);
    case "prompts/list":
      return { resultType: "complete", prompts: [] };
    default:
      return UNKNOWN_METHOD;
  }
}

/** A tool that ran and could not do what was asked answers isError, not a JSON-RPC error. */
async function callTool(params: Message, ctx: ToolContext) {
  const name = String(params?.name ?? "");
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return text(`No such tool: ${name}. Call tools/list for what this server offers.`, true);
  try {
    return text(JSON.stringify(await tool.run(params?.arguments ?? {}, ctx), null, 2));
  } catch (err) {
    if (err && typeof err === "object" && "toolError" in err) return text(String((err as unknown as Error).message), true);
    throw err;
  }
}

async function readResource(params: Message) {
  const uri = String(params?.uri ?? "");
  const resource = resources().find((r) => r.uri === uri);
  if (!resource) throw rpcError(ERRORS.RESOURCE_NOT_FOUND, `Resource not found: ${uri}`);
  const res = await fetch(resource.uri, { headers: { accept: "text/plain" } });
  return { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: await res.text() }] };
}

function text(body: string, isError = false) {
  return { content: [{ type: "text", text: body }], isError };
}
