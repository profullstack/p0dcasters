import { cookies, headers } from "next/headers";
import { all, one, db, args } from "@/lib/db";
import { now, sha256, token } from "./crypto";
import { SESSION_COOKIE } from "./cookie";

export { SESSION_COOKIE };
const SESSION_DAYS = 180;

export type User = { id: number; email: string; created_at: number };

export async function findOrCreateUser(rawEmail: string): Promise<User> {
  const email = rawEmail.trim().toLowerCase();
  const existing = await one<User>(
    "SELECT id, email, created_at FROM users WHERE email = ?",
    [email],
  );
  if (existing) return existing;
  await db().execute({
    sql: "INSERT OR IGNORE INTO users(email, created_at) VALUES(?, ?)",
    args: args([email, now()]),
  });
  const created = await one<User>(
    "SELECT id, email, created_at FROM users WHERE email = ?",
    [email],
  );
  if (!created) throw new Error("user could not be created");
  return created;
}

/** Mints a session and writes the cookie. Only the hash reaches the database. */
export async function startSession(userId: number): Promise<void> {
  const raw = token();
  const expires = now() + SESSION_DAYS * 86400;
  await db().execute({
    sql: "INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES(?,?,?,?)",
    args: args([sha256(raw), userId, now(), expires]),
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    await db().execute({
      sql: "DELETE FROM sessions WHERE token_hash = ?",
      args: args([sha256(raw)]),
    });
  }
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const row = await one<User & { expires_at: number }>(
    `SELECT u.id, u.email, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    [sha256(raw)],
  );
  if (!row) return null;
  if (row.expires_at < now()) {
    await db().execute({
      sql: "DELETE FROM sessions WHERE token_hash = ?",
      args: args([sha256(raw)]),
    });
    return null;
  }
  return { id: row.id, email: row.email, created_at: row.created_at };
}

export async function followedSlugs(userId: number): Promise<string[]> {
  const rows = await all<{ slug: string }>(
    "SELECT slug FROM follows WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );
  return rows.map((r) => r.slug);
}

/**
 * The origin this request arrived on. Passkeys are bound to it, and the magic
 * link has to point back at the same host the visitor typed — hardcoding
 * p0dcasters.com would make both fail on localhost and on the Railway domain.
 */
export async function origin(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-host") || h.get("host") || "p0dcasters.com";
  const proto =
    h.get("x-forwarded-proto") || (forwarded.startsWith("localhost") ? "http" : "https");
  return `${proto}://${forwarded}`;
}

export async function rpID(): Promise<string> {
  return new URL(await origin()).hostname;
}
