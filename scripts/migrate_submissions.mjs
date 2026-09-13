// Creates the submissions table. Safe to re-run: every statement is IF NOT EXISTS.
//
// A submitted show is inserted straight into `podcasts` so it is listed at
// once, and the row it was inserted as is kept here as JSON. The directory
// rebuild drops and reloads `podcasts` from the Podcast Index dump, so without
// this table every submission would vanish at the next refresh; load_turso.mjs
// merges the listed rows back in before the swap. Like the account tables and
// refresh_runs, this table must NEVER be on the loader's drop list.
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:./data/p0dcasters.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const c = createClient(url.startsWith("file:") ? { url } : { url, authToken });

export const DDL = [
  `CREATE TABLE IF NOT EXISTS submissions(
     id TEXT PRIMARY KEY,
     batch_id TEXT NOT NULL,
     input TEXT NOT NULL,
     feed_url TEXT,
     slug TEXT,
     title TEXT,
     status TEXT NOT NULL,
     error TEXT,
     message TEXT,
     podcast TEXT,
     user_id INTEGER,
     ip_hash TEXT,
     created_at INTEGER NOT NULL,
     resolved_at INTEGER,
     refreshed_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS i_sub_batch ON submissions(batch_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS i_sub_feed ON submissions(feed_url)`,
  `CREATE INDEX IF NOT EXISTS i_sub_status ON submissions(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS i_sub_ip ON submissions(ip_hash, created_at DESC)`,
];

for (const sql of DDL) {
  await c.execute(sql);
  console.log("ok:", sql.split("\n")[0].trim());
}

// The review columns, added after the table (submissions were listed on the
// spot at first; now a person approves them). SQLite has no ADD COLUMN IF NOT
// EXISTS, so each is tried and a "duplicate column" error is the fine case.
// src/lib/submit.ts does the same lazily, so a deploy never waits on this.
for (const col of ["submitted_by TEXT", "reviewed_at INTEGER", "reviewed_by TEXT", "reason TEXT"]) {
  try {
    await c.execute(`ALTER TABLE submissions ADD COLUMN ${col}`);
    console.log("added column:", col);
  } catch (e) {
    if (!/duplicate column/i.test(String(e))) throw e;
    console.log("column present:", col.split(" ")[0]);
  }
}
const by = await c.execute("SELECT status, COUNT(*) AS n FROM submissions GROUP BY status");
console.log("submissions:", by.rows.length ? by.rows.map((r) => `${r.status}=${r.n}`).join(" ") : "none");
