import { after } from "next/server";
import { ERRORS, fail } from "@/lib/mcp/protocol";
import { handle } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
// list_episodes reads a publisher's feed and submit_feed reads several; the
// rest answer from the database.
export const maxDuration = 60;

/**
 * The MCP endpoint. Streamable HTTP, POST only, no session, no auth: every
 * tool wraps a query the site already answers publicly, and the one write
 * carries the same budget as the form.
 */
export async function POST(req: Request) {
  const header = (name: string) => req.headers.get(name);
  const ctx = { header, after: (fn: () => Promise<void>) => after(fn) };

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return respond(400, fail(null, ERRORS.PARSE, "Invalid JSON"));
  }

  // Batches left the protocol in 2025-06-18, but older clients still send one.
  if (Array.isArray(payload)) {
    const answers = await Promise.all(payload.map((message) => handle(message, ctx)));
    const bodies = answers.map((a) => a.body).filter(Boolean);
    if (bodies.length === 0) return new Response(null, { status: 202, headers: cors() });
    return respond(200, bodies);
  }

  const { status, body } = await handle(payload, ctx);
  if (!body) return new Response(null, { status, headers: cors() });
  return respond(status, body);
}

/** The standalone SSE stream older revisions could open. Never had one here. */
export async function GET() {
  return respond(405, fail(null, ERRORS.METHOD_NOT_FOUND, "This MCP endpoint accepts POST only"), { allow: "POST, OPTIONS" });
}

export async function DELETE() {
  return respond(405, fail(null, ERRORS.METHOD_NOT_FOUND, "This MCP server is stateless"), { allow: "POST, OPTIONS" });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors() });
}

function respond(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors(), ...extra },
  });
}

function cors(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers":
      "content-type, accept, authorization, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, last-event-id",
    "access-control-expose-headers": "mcp-protocol-version",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
  };
}
