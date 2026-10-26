import { headers } from "next/headers";
import { normaliseEmail, pruneLinks, requestLink } from "@/lib/auth/magic";
import { origin } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";
import { signupProfileFrom } from "@/lib/auth/signupProfile";

export const dynamic = "force-dynamic";

// Always the same answer. Whether the address is known, whether it was rate
// limited, whether the send failed — all of it would tell a stranger who has an
// account here, so none of it is reported.
const SAME_ANSWER = {
  ok: true,
  message: "If that address can receive mail, a link is on its way.",
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(SAME_ANSWER);
  }
  const fields = (body ?? {}) as Record<string, unknown>;
  const { email: rawEmail, next: rawNext } = fields;
  const email = normaliseEmail(rawEmail);
  if (!email) {
    return Response.json(
      { ok: false, message: "That does not look like an email address." },
      { status: 400 },
    );
  }
  // /signup sends its profile fields with `signup: true`; they are checked
  // before any link is minted, so a refused form never mails anybody. Saying
  // a name is missing reveals nothing about who has an account.
  const signup = signupProfileFrom(fields, email);
  if (!signup.ok) {
    return Response.json(
      { ok: false, message: "A few of those fields need another look.", errors: signup.errors },
      { status: 400 },
    );
  }

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;

  try {
    await requestLink(email, await origin(), safeNext(rawNext), ip, signup.pending);
    await pruneLinks();
  } catch (err) {
    // A Resend outage must not become an account oracle either.
    console.error("magic link failed:", err);
  }
  return Response.json(SAME_ANSWER);
}
