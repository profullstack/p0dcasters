import { validateProfile, saveSignupProfile, type ProfileStore } from "@profullstack/profile";

/**
 * The /signup form's profile (@profullstack/profile: name, company, title,
 * LinkedIn). There is no account until the emailed link is opened, so the
 * validated fields ride on the link (login_tokens.profile, JSON) and are saved
 * on verify. Plain sign-in never sends them and is never asked for them.
 *
 * Kept free of the database so it can be tested on its own.
 */

/** Only a body that says it is a signup is checked; /login posts just an email. */
export function signupProfileFrom(
  body: Record<string, unknown>,
  email: string,
):
  | { ok: true; pending: string | null }
  | { ok: false; errors: Record<string, string> } {
  if (body.signup !== true) return { ok: true, pending: null };
  const check = validateProfile({ ...body, email });
  if (!check.ok) return { ok: false, errors: check.errors };
  return { ok: true, pending: JSON.stringify(check.profile) };
}

/** The fields a link carried, or null for a sign-in link or a mangled value. */
export function parsePending(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Saves what the signup form gave, once the link proved the address. A failure
 * here is logged and swallowed: it must never stand between someone and
 * signing in, and the account page lets them fill it in again.
 */
export async function saveVerifiedProfile(
  store: ProfileStore,
  user: { id: number | string; email: string },
  raw: unknown,
): Promise<void> {
  const fields = parsePending(raw);
  if (!fields) return;
  try {
    await saveSignupProfile(store, String(user.id), fields, { email: user.email });
  } catch (err) {
    console.error("signup profile not saved:", err);
  }
}
