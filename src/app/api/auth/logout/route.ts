import { endSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await endSession();
  const accepts = req.headers.get("accept") || "";
  if (accepts.includes("application/json")) return Response.json({ ok: true });
  return Response.redirect(new URL("/", req.url), 303);
}
