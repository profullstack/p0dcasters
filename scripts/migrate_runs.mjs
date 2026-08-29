// Creates the table behind /crawlstats. Safe to re-run: IF NOT EXISTS throughout.
//
// The refresh pipeline runs from cron on a box that is not the web service, and
// writes its progress to a log file there. Nothing in production can read that
// file, so a status page has only one honest source: the pipeline records each
// run into the same database the site reads. That is this table.
//
// Like the account tables it must survive the directory reload — scripts/README.md's
// clean rebuild drops `podcasts` and `podcasts_fts` and nothing else. Losing it
// would erase the history the page is made of, so keep it off that list.
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:./data/p0dcasters.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const c = createClient(url.startsWith("file:") ? { url } : { url, authToken });

const DDL = [
  // One row per invocation of refresh-if-new-dump.sh, including the ones that
  // find nothing to do. Those matter most: four "skipped" rows a day are the
  // only evidence the cron entry still exists, and their absence is the
  // failure the page is for.
  //
  // `run_key` is minted by the shell script so it can upsert the same row as
  // the run progresses (running -> ok/failed) without parsing an id back out
  // of this script's output.
  `CREATE TABLE IF NOT EXISTS refresh_runs(
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     run_key TEXT NOT NULL,
     started_at INTEGER NOT NULL,
     finished_at INTEGER,
     status TEXT NOT NULL,
     step TEXT,
     dump_modified TEXT,
     dump_bytes INTEGER,
     podcast_count INTEGER,
     prev_count INTEGER,
     categories TEXT,
     message TEXT,
     log TEXT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS i_runs_key ON refresh_runs(run_key)`,
  `CREATE INDEX IF NOT EXISTS i_runs_started ON refresh_runs(started_at DESC)`,
];

for (const sql of DDL) {
  await c.execute(sql);
  console.log("ok:", sql.split("\n")[0].trim());
}

const n = await c.execute("SELECT COUNT(*) AS n FROM refresh_runs");
console.log("\nrefresh_runs rows:", n.rows[0].n);
