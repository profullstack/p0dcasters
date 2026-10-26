import { redirect } from "next/navigation";
import { consumeLink } from "@/lib/auth/magic";
import { findOrCreateUser, startSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";
import { saveVerifiedProfile } from "@/lib/auth/signupProfile";
import { profileStore } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const token = params.get("token") || "";
  const next = safeNext(params.get("next"));

  const link = token ? await consumeLink(token) : null;
  if (!link) redirect("/login?expired=1");

  // An unknown address makes the account here. There is no separate sign-up
  // flow to keep in step — opening the link IS the registration.
  const user = await findOrCreateUser(link.email);
  // A /signup link carries the form's name and details; saved now the account
  // exists. Never blocks the sign-in.
  await saveVerifiedProfile(profileStore(), user, link.profile);
  await startSession(user.id);
  redirect(next || "/following");
}
