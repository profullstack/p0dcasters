// Creates the account tables. Safe to re-run: every statement is IF NOT EXISTS.
//
// These tables live alongside `podcasts` in the same Turso database but are
// deliberately NOT touched by the directory refresh — scripts/README.md's clean
// rebuild only drops `podcasts` and `podcasts_fts`. That is also why `follows`
// keys shows by slug and not by `podcasts.id`: the reload reassigns ids, and a
// numeric key would silently repoint everybody's follows at other shows.
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:./data/p0dcasters.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const c = createClient(url.startsWith("file:") ? { url } : { url, authToken });

const DDL = [
  `CREATE TABLE IF NOT EXISTS users(
     id INTEGER PRIMARY KEY,
     email TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     last_seen_at INTEGER)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS i_users_email ON users(email)`,

  // Only the SHA-256 of a session token is stored, so a leaked row cannot be
  // replayed as a cookie.
  `CREATE TABLE IF NOT EXISTS sessions(
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS i_sessions_user ON sessions(user_id)`,

  `CREATE TABLE IF NOT EXISTS login_tokens(
     token_hash TEXT PRIMARY KEY,
     email TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     used_at INTEGER,
     ip TEXT)`,
  `CREATE INDEX IF NOT EXISTS i_login_email ON login_tokens(email, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS i_login_ip ON login_tokens(ip, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS credentials(
     id TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL,
     public_key TEXT NOT NULL,
     counter INTEGER NOT NULL DEFAULT 0,
     transports TEXT,
     label TEXT,
     created_at INTEGER NOT NULL,
     last_used_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS i_cred_user ON credentials(user_id)`,

  `CREATE TABLE IF NOT EXISTS follows(
     user_id INTEGER NOT NULL,
     slug TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY(user_id, slug))`,
  `CREATE INDEX IF NOT EXISTS i_follows_slug ON follows(slug)`,
];

for (const sql of DDL) {
  await c.execute(sql);
  console.log("ok:", sql.split("\n")[0].trim());
}

const tables = await c.execute(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
);
console.log("\ntables:", tables.rows.map((r) => r.name).join(", "));
