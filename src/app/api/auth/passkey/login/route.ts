import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { loginOptions, loginVerify } from "@/lib/auth/passkey";
import { startSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await loginOptions());
}

export async function POST(req: Request) {
  let body: { response?: AuthenticationResponseJSON };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!body.response) return Response.json({ error: "bad request" }, { status: 400 });

  const result = await loginVerify(body.response);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  await startSession(result.userId);
  return Response.json({ ok: true });
}
