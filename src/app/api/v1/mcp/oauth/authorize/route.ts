import { authorize, json } from "@/lib/mcp/open-oauth";

export const dynamic = "force-dynamic";

// No login and no consent page: the MCP endpoint is public, so this only
// completes the handshake connector clients insist on.
export function GET(req: Request) {
  const answer = authorize(new URL(req.url).searchParams);
  if ("location" in answer) {
    return new Response(null, { status: 302, headers: { location: answer.location, "cache-control": "no-store" } });
  }
  return json(answer.body, answer.status);
}
