// Sign in with CoinPay (CoinPay is the house master account).
//
// Confidential OIDC client: authorization code + PKCE S256 + state + nonce,
// redirect https://p0dcasters.com/api/v1/coinpay/oauth/callback, scopes
// "openid profile email". The protocol half (authorize URL, code exchange,
// id_token checks, userinfo) is @profullstack/coinpay-onboard/oauth.
//
// STANDING security rule: a CoinPay login binds to the CoinPay `sub` in
// coinpay_identities. It never signs in to an existing account because the
// CoinPay email matches (CoinPay never verifies emails), never stores that
// email as the account's email, and never grants anything from it. Linking
// CoinPay to an existing account happens only from /account while signed in.
// A first CoinPay login with no link makes a NEW account whose email is an
// undeliverable placeholder; the CoinPay email is kept on the identity row as
// unverified contact info only.
//
// Nothing here imports the database, so the decision logic is tested in memory
// against the CoinpayStore interface; coinpay-store.ts is the real one.
import { randomBytes } from "node:crypto";
import { authorizeUrl as cpAuthorizeUrl, pkce, randomToken, SIGN_IN_SCOPES } from "@profullstack/coinpay-onboard/oauth";
import { env, now, seal, unseal } from "./crypto";
import { safeNext } from "./next";

export const COINPAY_BASE = "https://coinpayportal.com";
export const CALLBACK_PATH = "/api/v1/coinpay/oauth/callback";
export const PENDING_COOKIE = "p0d_cp_oauth";
export const PENDING_COOKIE_PATH = "/api/v1/coinpay/oauth";
export const PENDING_TTL = 600;
/** Accounts a CoinPay login created. `.invalid` can never receive mail (RFC 2606). */
export const PLACEHOLDER_EMAIL_DOMAIN = "coinpay.p0dcasters.invalid";

export type CoinpayConfig = { clientId: string; clientSecret: string; base: string; siteUrl: string };

export function coinpayConfig(): CoinpayConfig | null {
  const clientId = (env("COINPAY_OAUTH_CLIENT_ID") || "").trim();
  const clientSecret = (env("COINPAY_OAUTH_CLIENT_SECRET") || "").trim();
  if (!clientId || !clientSecret) return null;
  const base = (env("COINPAY_OAUTH_ISSUER") || COINPAY_BASE).trim().replace(/\/+$/, "");
  // The redirect URI must match the registration exactly, so it is fixed to
  // the canonical host rather than whatever Host header the request carried.
  const siteUrl = (env("SITE_URL") || "https://p0dcasters.com").trim().replace(/\/+$/, "");
  return { clientId, clientSecret, base, siteUrl };
}

export const redirectUri = (cfg: Pick<CoinpayConfig, "siteUrl">) => cfg.siteUrl + CALLBACK_PATH;

export type OAuthMode = "login" | "connect";
export type PendingAuth = { state: string; verifier: string; nonce: string; mode: OAuthMode; next: string; exp: number };

/** A fresh pending sign-in plus the authorize URL that starts it. */
export function beginSignIn(cfg: CoinpayConfig, mode: OAuthMode, next: string): { pending: PendingAuth; url: string } {
  const { verifier, challenge } = pkce();
  const pending: PendingAuth = {
    state: randomToken(),
    verifier,
    nonce: randomToken(),
    mode,
    next: safeNext(next),
    exp: now() + PENDING_TTL,
  };
  const url = cpAuthorizeUrl({
    clientId: cfg.clientId,
    redirectUri: redirectUri(cfg),
    state: pending.state,
    nonce: pending.nonce,
    challenge,
    scopes: SIGN_IN_SCOPES,
    base: cfg.base,
  });
  return { pending, url };
}

/** HMAC-sealed (AUTH_SECRET) so a browser can hold it but not forge or edit it. */
export function encodePending(p: PendingAuth): string {
  return seal(JSON.stringify(p));
}

export function decodePending(raw: string | undefined): PendingAuth | null {
  const value = unseal(raw);
  if (!value) return null;
  try {
    const o = JSON.parse(value);
    if (!o || typeof o.state !== "string" || typeof o.verifier !== "string" || typeof o.nonce !== "string") return null;
    if (o.mode !== "login" && o.mode !== "connect") return null;
    if (typeof o.exp !== "number" || o.exp < now()) return null;
    return { state: o.state, verifier: o.verifier, nonce: o.nonce, mode: o.mode, next: safeNext(o.next), exp: o.exp };
  } catch {
    return null;
  }
}

export type CoinpayClaims = { sub: string; email: string | null; name: string | null };

export type IdentityRow = {
  user_id: number;
  coinpay_sub: string;
  coinpay_email: string | null;
  coinpay_name: string | null;
  created_via: "connect" | "signup";
};

export interface CoinpayStore {
  identityBySub(sub: string): Promise<IdentityRow | null>;
  identityByUser(userId: number): Promise<IdentityRow | null>;
  /** Insert; "conflict" when the sub or the user is already bound. */
  link(row: IdentityRow): Promise<"ok" | "conflict">;
  unlink(userId: number): Promise<void>;
  touch(sub: string): Promise<void>;
  /** A brand-new user with the given placeholder email (digest off). */
  createUser(email: string): Promise<number>;
  deleteUser(userId: number): Promise<void>;
}

export function placeholderEmail(): string {
  return `cp-${randomBytes(12).toString("hex")}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith("@" + PLACEHOLDER_EMAIL_DOMAIN);
}

export type Resolution =
  | { ok: true; userId: number; action: "login" | "created" | "linked" }
  | { ok: false; code: "not_signed_in" | "linked_elsewhere" | "already_connected"; error: string };

/**
 * Which p0dcasters user a verified CoinPay sub belongs to. Never looks at the
 * email: a CoinPay login carrying an existing user's address gets a NEW account
 * (or the one already bound to its sub), never that user's.
 */
export async function resolveCoinpayUser(
  input: { mode: OAuthMode; currentUserId: number | null; claims: CoinpayClaims },
  store: CoinpayStore,
): Promise<Resolution> {
  const { claims } = input;
  const bound = await store.identityBySub(claims.sub);

  if (input.mode === "connect") {
    if (!input.currentUserId) {
      return { ok: false, code: "not_signed_in", error: "Sign in to p0dcasters first, then connect CoinPay from your account page." };
    }
    if (bound) {
      if (bound.user_id === input.currentUserId) return { ok: true, userId: bound.user_id, action: "linked" };
      return { ok: false, code: "linked_elsewhere", error: "That CoinPay account is already connected to another p0dcasters account." };
    }
    if (await store.identityByUser(input.currentUserId)) {
      return { ok: false, code: "already_connected", error: "This account is already connected to a different CoinPay account. Disconnect it first." };
    }
    const r = await store.link({
      user_id: input.currentUserId,
      coinpay_sub: claims.sub,
      coinpay_email: claims.email,
      coinpay_name: claims.name,
      created_via: "connect",
    });
    if (r === "conflict") return { ok: false, code: "linked_elsewhere", error: "That CoinPay account was just connected elsewhere." };
    return { ok: true, userId: input.currentUserId, action: "linked" };
  }

  if (bound) {
    await store.touch(claims.sub);
    return { ok: true, userId: bound.user_id, action: "login" };
  }

  const userId = await store.createUser(placeholderEmail());
  const r = await store.link({
    user_id: userId,
    coinpay_sub: claims.sub,
    coinpay_email: claims.email,
    coinpay_name: claims.name,
    created_via: "signup",
  });
  if (r === "conflict") {
    // Two first logins raced; the other one won the sub. Use its account.
    await store.deleteUser(userId);
    const winner = await store.identityBySub(claims.sub);
    if (!winner) return { ok: false, code: "linked_elsewhere", error: "CoinPay sign-in raced; try again." };
    return { ok: true, userId: winner.user_id, action: "login" };
  }
  return { ok: true, userId, action: "created" };
}

/**
 * Disconnect is refused when CoinPay is the only way back in: a placeholder
 * email cannot receive a sign-in link, so without a passkey the account would
 * be locked out for good.
 */
export function canDisconnect(user: { email: string }, passkeyCount: number): boolean {
  return !isPlaceholderEmail(user.email) || passkeyCount > 0;
}

/** Trims what userinfo returned to what is stored; the email is contact info only. */
export function claimsFrom(r: { sub: string; email: string | null; name: string | null }): CoinpayClaims {
  const email = typeof r.email === "string" && r.email.includes("@") ? r.email.slice(0, 320) : null;
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 200) : null;
  return { sub: r.sub, email, name };
}

const MESSAGES: Record<string, string> = {
  unavailable: "Sign in with CoinPay is not available right now. Use your email instead.",
  expired: "That CoinPay sign-in took too long or was opened in another browser. Try again.",
  state: "That CoinPay sign-in could not be verified. Try again.",
  denied: "CoinPay sign-in was cancelled.",
  failed: "CoinPay could not confirm the sign-in. Try again.",
  not_signed_in: "Sign in first, then connect CoinPay from your account page.",
  linked_elsewhere: "That CoinPay account is already connected to another p0dcasters account.",
  already_connected: "This account is already connected to a different CoinPay account. Disconnect it first.",
  only_way_in: "CoinPay is the only way into this account. Add a passkey first, then disconnect.",
};

/** The reader-facing line for a ?coinpay= result code, or null. */
export function coinpayMessage(code: unknown): string | null {
  return typeof code === "string" ? MESSAGES[code] ?? null : null;
}
