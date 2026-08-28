import { db, one, args } from "@/lib/db";
import { now, sha256, token } from "./crypto";
import { linkMail, sendMail } from "./mail";

const TTL = 15 * 60;
const PER_EMAIL = 4; // in one TTL window
const PER_IP = 20;

export function normaliseEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  // Deliberately loose: the link itself is the real check on an address.
  if (email.length < 6 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/**
 * Mints a link and mails it. Returns nothing about whether the address is
 * known, and swallows the rate limit as success — the caller answers "if that
 * address can receive mail, a link is on its way" either way, so this endpoint
 * can never be used to enumerate who has an account.
 */
export async function requestLink(
  email: string,
  origin: string,
  next: string,
  ip: string | null,
): Promise<void> {
  const since = now() - TTL;
  const byEmail = await one<{ n: number }>(
    "SELECT COUNT(*) n FROM login_tokens WHERE email = ? AND created_at > ?",
    [email, since],
  );
  if (Number(byEmail?.n ?? 0) >= PER_EMAIL) return;
  if (ip) {
    const byIp = await one<{ n: number }>(
      "SELECT COUNT(*) n FROM login_tokens WHERE ip = ? AND created_at > ?",
      [ip, since],
    );
    if (Number(byIp?.n ?? 0) >= PER_IP) return;
  }

  const raw = token();
  await db().execute({
    sql: "INSERT INTO login_tokens(token_hash, email, created_at, expires_at, ip) VALUES(?,?,?,?,?)",
    args: args([sha256(raw), email, now(), now() + TTL, ip]),
  });

  const known = await one<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
  const url = `${origin}/auth/verify?token=${raw}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  const mail = linkMail(url, !known);
  await sendMail(email, mail.subject, mail.html, mail.text);
}

/** Burns the token and returns the address it proved, or null. */
export async function consumeLink(raw: string): Promise<string | null> {
  const hash = sha256(raw);
  const row = await one<{ email: string; expires_at: number; used_at: number | null }>(
    "SELECT email, expires_at, used_at FROM login_tokens WHERE token_hash = ?",
    [hash],
  );
  if (!row || row.used_at !== null || row.expires_at < now()) return null;
  // Single-use: the UPDATE's own WHERE is the guard, so two simultaneous
  // openings of the same link cannot both come back a winner.
  const res = await db().execute({
    sql: "UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL",
    args: args([now(), hash]),
  });
  if (Number(res.rowsAffected ?? 0) < 1) return null;
  return row.email;
}

/** Housekeeping so the table does not grow without bound. */
export async function pruneLinks(): Promise<void> {
  await db().execute({
    sql: "DELETE FROM login_tokens WHERE expires_at < ?",
    args: args([now() - 86400]),
  });
}
