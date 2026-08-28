import { currentUser } from "@/lib/auth/session";
import { deleteCredential } from "@/lib/auth/passkey";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in first" }, { status: 401 });

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "bad request" }, { status: 400 });

  // Losing every passkey is recoverable — the emailed link is still the way
  // back in — so there is nothing to stop someone removing their last one.
  await deleteCredential(user.id, body.id);
  return Response.json({ ok: true });
}
