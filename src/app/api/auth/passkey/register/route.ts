import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { currentUser } from "@/lib/auth/session";
import { registerOptions, registerVerify } from "@/lib/auth/passkey";

export const dynamic = "force-dynamic";

/** A passkey is only ever added from inside a session that already exists. */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in first" }, { status: 401 });
  return Response.json(await registerOptions(user));
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in first" }, { status: 401 });

  let body: { response?: RegistrationResponseJSON; label?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!body.response) return Response.json({ error: "bad request" }, { status: 400 });

  const label = typeof body.label === "string" ? body.label.slice(0, 60) : null;
  const result = await registerVerify(user, body.response, label);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true });
}
