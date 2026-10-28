import { currentUser } from "@/lib/auth/session";
import { isSubscribed, setSubscribed } from "@/lib/newsletter-store";

export const dynamic = "force-dynamic";

/**
 * The signed-in listener's weekly digest setting: GET { subscribed }, PUT
 * { subscribed: boolean }. Session cookie only, like /api/v1/me/profile;
 * anybody else gets a 401.
 */
const HEADERS = { "cache-control": "no-store" };

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401, headers: HEADERS });
  return Response.json({ subscribed: await isSubscribed(user.id) }, { headers: HEADERS });
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401, headers: HEADERS });
  const body = (await req.json().catch(() => null)) as { subscribed?: unknown } | null;
  if (typeof body?.subscribed !== "boolean") {
    return Response.json({ error: "send { \"subscribed\": true | false }" }, { status: 400, headers: HEADERS });
  }
  await setSubscribed(user.id, body.subscribed);
  return Response.json({ subscribed: await isSubscribed(user.id) }, { headers: HEADERS });
}
