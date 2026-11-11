import { json, token, preflight } from "@/lib/mcp/open-oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  let form: URLSearchParams;
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, string>;
    form = new URLSearchParams(body);
  } else {
    form = new URLSearchParams(await req.text());
  }
  const { status, body } = await token(form);
  return json(body, status);
}
export const OPTIONS = () => preflight();
