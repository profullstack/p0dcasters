import { redirect } from "next/navigation";
import { consumeLink } from "@/lib/auth/magic";
import { findOrCreateUser, startSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const token = params.get("token") || "";
  const next = safeNext(params.get("next"));

  const email = token ? await consumeLink(token) : null;
  if (!email) redirect("/login?expired=1");

  // An unknown address makes the account here. There is no separate sign-up
  // flow to keep in step — opening the link IS the registration.
  const user = await findOrCreateUser(email);
  await startSession(user.id);
  redirect(next || "/following");
}
