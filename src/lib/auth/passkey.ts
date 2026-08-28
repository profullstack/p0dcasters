import { cookies } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { all, db, one, args } from "@/lib/db";
import { now, seal, unseal } from "./crypto";
import { origin, rpID, type User } from "./session";

const CHALLENGE_COOKIE = "p0d_challenge";
const CHALLENGE_TTL = 5 * 60;

export type Credential = {
  id: string;
  user_id: number;
  public_key: string;
  counter: number;
  transports: string | null;
  label: string | null;
  created_at: number;
  last_used_at: number | null;
};

// The challenge is a one-shot nonce, not a secret, so a signed cookie holds it
// rather than a table — nothing to clean up and nothing to look up.
async function putChallenge(challenge: string) {
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, seal(`${challenge}|${now() + CHALLENGE_TTL}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHALLENGE_TTL,
  });
}

async function takeChallenge(): Promise<string | null> {
  const jar = await cookies();
  const value = unseal(jar.get(CHALLENGE_COOKIE)?.value);
  jar.delete(CHALLENGE_COOKIE);
  if (!value) return null;
  const [challenge, expiry] = value.split("|");
  if (!challenge || Number(expiry) < now()) return null;
  return challenge;
}

export async function credentialsFor(userId: number): Promise<Credential[]> {
  return all<Credential>(
    "SELECT * FROM credentials WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );
}

export async function registerOptions(user: User) {
  const existing = await credentialsFor(user.id);
  const options = await generateRegistrationOptions({
    rpName: "p0dcasters",
    rpID: await rpID(),
    userID: new TextEncoder().encode(String(user.id)),
    userName: user.email,
    userDisplayName: user.email,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
  await putChallenge(options.challenge);
  return options;
}

export async function registerVerify(
  user: User,
  response: RegistrationResponseJSON,
  label: string | null,
) {
  const expectedChallenge = await takeChallenge();
  if (!expectedChallenge) return { ok: false as const, error: "challenge expired" };

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: await origin(),
    expectedRPID: await rpID(),
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false as const, error: "could not verify that passkey" };
  }

  const cred = verification.registrationInfo.credential;
  await db().execute({
    sql: `INSERT INTO credentials(id, user_id, public_key, counter, transports, label, created_at)
          VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET counter = excluded.counter`,
    args: args([
      cred.id,
      user.id,
      Buffer.from(cred.publicKey).toString("base64url"),
      cred.counter,
      (cred.transports || []).join(","),
      label,
      now(),
    ]),
  });
  return { ok: true as const };
}

/** Usernameless: no allowCredentials, so the browser offers whatever it holds. */
export async function loginOptions() {
  const options = await generateAuthenticationOptions({
    rpID: await rpID(),
    userVerification: "preferred",
  });
  await putChallenge(options.challenge);
  return options;
}

export async function loginVerify(response: AuthenticationResponseJSON) {
  const expectedChallenge = await takeChallenge();
  if (!expectedChallenge) return { ok: false as const, error: "challenge expired" };

  const cred = await one<Credential>("SELECT * FROM credentials WHERE id = ?", [
    response.id,
  ]);
  if (!cred) return { ok: false as const, error: "that passkey is not registered here" };

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: await origin(),
    expectedRPID: await rpID(),
    requireUserVerification: false,
    credential: {
      id: cred.id,
      publicKey: new Uint8Array(Buffer.from(cred.public_key, "base64url")),
      counter: Number(cred.counter),
      transports: cred.transports
        ? (cred.transports.split(",").filter(Boolean) as never)
        : undefined,
    },
  });
  if (!verification.verified) {
    return { ok: false as const, error: "could not verify that passkey" };
  }

  await db().execute({
    sql: "UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?",
    args: args([verification.authenticationInfo.newCounter, now(), cred.id]),
  });
  return { ok: true as const, userId: Number(cred.user_id) };
}

export async function deleteCredential(userId: number, id: string) {
  await db().execute({
    sql: "DELETE FROM credentials WHERE id = ? AND user_id = ?",
    args: args([id, userId]),
  });
}
