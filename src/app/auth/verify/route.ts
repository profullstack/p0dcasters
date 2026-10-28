import { redirect } from "next/navigation";
import { consumeLink } from "@/lib/auth/magic";
import { findOrCreateUser, startSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";
import { newsletterChoice, saveVerifiedProfile } from "@/lib/auth/signupProfile";
import { setSubscribed } from "@/lib/newsletter-store";
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
  // Accounts get the weekly digest by default; an unticked signup box turns it
  // off now. Like the profile, it never stands between someone and signing in.
  if (newsletterChoice(link.profile) === false) {
    await setSubscribed(user.id, false).catch((err) => console.error("newsletter choice not saved:", err));
  }
  await startSession(user.id);
  redirect(next || "/following");
}
