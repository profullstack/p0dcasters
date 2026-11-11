import { json, register, preflight } from "@/lib/mcp/open-oauth";

export const dynamic = "force-dynamic";

// RFC 7591 dynamic client registration; every client is welcome.
export async function POST(req: Request) {
  let meta: Record<string, unknown>;
  try {
    meta = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_client_metadata" }, 400);
  }
  const { status, body } = register(meta ?? {});
  return json(body, status);
}
export const OPTIONS = () => preflight();
