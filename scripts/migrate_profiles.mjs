// Creates the podcaster profile tables. Safe to re-run: every statement is IF NOT EXISTS.
//
// `podcast_profiles` is what a podcaster corrected on their OpenProfile.md
// (src/lib/openprofile/store.ts) and who claimed it. It is keyed by SLUG, not
// by podcasts.id, for the same reason `follows` is: the weekly reload
// reassigns ids, and a claim has to survive the rebuild. `profile_sources`
// caches what rssamplifier.com knows about the same feed, a day at a time.
// Like the account tables and `submissions`, neither is ever on the loader's
// drop list. The app also creates both lazily on first use, so a deploy never
// waits on this; run it against prod once so the tables exist before the
// first request does.
//
//   logicsrc teams pull profullstack p0dcasters prod --env /tmp/p0d.env
//   export $(grep -E '^TURSO_(DATABASE_URL|AUTH_TOKEN)=' /tmp/p0d.env | xargs)
//   node scripts/migrate_profiles.mjs
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:./data/p0dcasters.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const c = createClient(url.startsWith("file:") ? { url } : { url, authToken });

export const DDL = [
  `CREATE TABLE IF NOT EXISTS podcast_profiles(
     slug TEXT PRIMARY KEY,
     overrides TEXT,
     public INTEGER NOT NULL DEFAULT 1,
     owner_user_id INTEGER,
     owner_email TEXT,
     owner_principal TEXT,
     claimed_at INTEGER,
     claim_method TEXT,
     updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS i_profiles_updated ON podcast_profiles(updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS i_profiles_owner ON podcast_profiles(owner_user_id)`,
  `CREATE TABLE IF NOT EXISTS profile_sources(
     feed_url TEXT NOT NULL,
     source TEXT NOT NULL,
     url TEXT,
     body TEXT,
     fetched_at INTEGER NOT NULL,
     PRIMARY KEY(feed_url, source))`,
];

for (const sql of DDL) {
  await c.execute(sql);
  console.log("ok:", sql.split("\n")[0].trim());
}
const n = await c.execute("SELECT COUNT(*) AS n, SUM(claimed_at IS NOT NULL) AS claimed FROM podcast_profiles");
console.log("profiles:", n.rows[0].n, "claimed:", n.rows[0].claimed ?? 0);
