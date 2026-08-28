import { endSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await endSession();
  const accepts = req.headers.get("accept") || "";
  if (accepts.includes("application/json")) return Response.json({ ok: true });
  // A relative Location, deliberately. Behind Railway's proxy `req.url` is
  // rebuilt from the internal bind address, so `new URL("/", req.url)` sends
  // the browser to localhost:8080 instead of the site it came from.
  return new Response(null, { status: 303, headers: { location: "/" } });
}
