// Load the freshly built local directory into Turso without ever leaving prod
// empty.
//
// The old version dropped `podcasts` first and inserted into the hole, so any
// failure between the drop and the last batch -- an expired credential, a
// network blip, a killed process -- left the site with no directory at all
// until somebody re-ran it by hand. Now the rows go into `podcasts_new` while
// `podcasts` keeps serving, and the switch is one write transaction: drop the
// old table and its FTS index, rename the staged table into place, rebuild the
// indexes and the FTS index. If anything in that transaction fails it rolls
// back and the old directory is still there; if anything before it fails, the
// old directory was never touched. A leftover `podcasts_new` from a crash is
// dropped on the next attempt.
//
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/load_turso.mjs
//   P0D_LOCAL_DB overrides the local build to load (default: the data dir).
//
// The same database holds the account tables (users, sessions, login_tokens,
// credentials, follows) and refresh_runs. Nothing here touches them.
import { DatabaseSync } from "node:sqlite";

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || (!url.startsWith("file:") && !authToken)) {
  console.error("load_turso: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
  process.exit(2);
}
const c = createClient(url.startsWith("file:") ? { url } : { url, authToken });

const LOCAL = process.env.P0D_LOCAL_DB || "/home/anthony/p0dcasters-data/p0dcasters.db";
const local = new DatabaseSync(LOCAL, { readOnly: true });

const COLUMNS = `(
 id INTEGER PRIMARY KEY, slug TEXT NOT NULL, guid TEXT, feed_url TEXT NOT NULL, title TEXT NOT NULL,
 description TEXT NOT NULL, image_url TEXT NOT NULL, link TEXT, host TEXT NOT NULL,
 author TEXT, owner TEXT, explicit INTEGER NOT NULL DEFAULT 0, language TEXT, lang_base TEXT,
 category TEXT, categories TEXT, episode_count INTEGER NOT NULL, newest_pubdate INTEGER NOT NULL,
 oldest_pubdate INTEGER, created_on INTEGER, latest_audio TEXT, latest_duration INTEGER,
 generator TEXT, per_week REAL, score REAL NOT NULL)`;

const cols = ["id","slug","guid","feed_url","title","description","image_url","link","host","author",
  "owner","explicit","language","lang_base","category","categories","episode_count","newest_pubdate",
  "oldest_pubdate","created_on","latest_audio","latest_duration","generator","per_week","score"];

const rows = local.prepare(`SELECT ${cols.join(",")} FROM podcasts`).all();
console.log("local rows:", rows.length);
if (rows.length === 0) {
  console.error("load_turso: the local build has no rows; refusing to touch prod");
  process.exit(1);
}

// --- 1. stage -----------------------------------------------------------------
await c.execute("DROP TABLE IF EXISTS podcasts_new");
await c.execute(`CREATE TABLE podcasts_new${COLUMNS}`);
console.log("staging table created");

const ph = cols.map(() => "?").join(",");
const sql = `INSERT INTO podcasts_new VALUES(${ph})`;
const BATCH = 400;
let done = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH);
  await c.batch(
    slice.map((r) => ({
      sql,
      // libSQL cannot bind undefined: it throws remotely but binds as null
      // locally, so normalise every value before it leaves here.
      args: cols.map((k) => (r[k] === undefined || r[k] === null ? null : r[k])),
    })),
    "write",
  );
  done += slice.length;
  if (done % 4000 === 0 || done === rows.length) console.log("staged", done);
}

const staged = Number((await c.execute("SELECT COUNT(*) AS n FROM podcasts_new")).rows[0].n);
if (staged !== rows.length) {
  console.error(`load_turso: staged ${staged} rows, expected ${rows.length}; prod untouched`);
  process.exit(1);
}

// --- 2. swap ------------------------------------------------------------------
// One transaction. The FTS table is an external-content index over `podcasts`,
// so it goes first and comes back last; the indexes are recreated on the
// renamed table because index names are shared across the whole database and
// the old ones die with the old table inside this same transaction.
await c.batch(
  [
    "DROP TABLE IF EXISTS podcasts_fts",
    "DROP TABLE IF EXISTS podcasts",
    "ALTER TABLE podcasts_new RENAME TO podcasts",
    "CREATE UNIQUE INDEX i_slug ON podcasts(slug)",
    "CREATE INDEX i_cat ON podcasts(category)",
    "CREATE INDEX i_lang ON podcasts(lang_base)",
    "CREATE INDEX i_host ON podcasts(host)",
    "CREATE INDEX i_score ON podcasts(score DESC)",
    "CREATE INDEX i_new ON podcasts(newest_pubdate DESC)",
    `CREATE VIRTUAL TABLE podcasts_fts USING fts5(
       title, description, author, host, content='podcasts', content_rowid='id',
       tokenize='unicode61 remove_diacritics 2')`,
    `INSERT INTO podcasts_fts(rowid,title,description,author,host)
       SELECT id,title,description,COALESCE(author,''),host FROM podcasts`,
    "INSERT INTO podcasts_fts(podcasts_fts) VALUES('optimize')",
  ],
  "write",
);
console.log("swapped in");

// --- 3. verify ----------------------------------------------------------------
const n = Number((await c.execute("SELECT COUNT(*) AS n FROM podcasts")).rows[0].n);
const f = Number((await c.execute("SELECT COUNT(*) AS n FROM podcasts_fts")).rows[0].n);
console.log("remote podcasts:", n, "fts rows:", f);
if (n !== rows.length || f !== rows.length) {
  console.error(`load_turso: remote has ${n} podcasts / ${f} fts rows, expected ${rows.length}`);
  process.exit(1);
}
