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
// credentials, follows), refresh_runs and submissions. Nothing here drops
// them; submissions is READ so that shows publishers added are put back.
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

// --- 1b. the platform list --------------------------------------------------
// export_indie.py writes it beside podcasts; a local build from before the
// table existed simply leaves prod's copy alone.
let platformRows = [];
try {
  platformRows = local.prepare("SELECT host, feeds FROM platform_hosts").all();
} catch {
  console.log("no platform_hosts in the local build; keeping prod's");
}
if (platformRows.length) {
  await c.execute("DROP TABLE IF EXISTS platform_hosts_new");
  await c.execute("CREATE TABLE platform_hosts_new(host TEXT PRIMARY KEY, feeds INTEGER NOT NULL)");
  for (let i = 0; i < platformRows.length; i += BATCH) {
    await c.batch(
      platformRows.slice(i, i + BATCH).map((r) => ({
        sql: "INSERT OR IGNORE INTO platform_hosts_new VALUES(?,?)",
        args: [r.host, r.feeds],
      })),
      "write",
    );
  }
  console.log("platform hosts staged:", platformRows.length);
}

// --- 1c. shows their publishers added --------------------------------------
// `submissions` survives the reload (it is never dropped), and every row it
// holds with status 'listed' carries the podcasts row it was inserted as. Those
// go into the staged table too, so a submitted show is not lost when the dump
// replaces the directory. Skipped when the dump now carries the same feed --
// the dump's row wins and the submission's slug is kept on it so follows and
// links survive -- and skipped once the show has aged past the directory's
// own 90-day rule, exactly as a dump row would have. The stored metadata is
// re-read from each feed first (bounded, best effort) so a show that kept
// publishing since it was submitted is scored on its real state.
const merged = await mergeSubmissions();
console.log("submitted shows merged:", merged);

async function mergeSubmissions() {
  let subs;
  try {
    subs = (await c.execute("SELECT id, feed_url, slug, podcast FROM submissions WHERE status = 'listed' AND podcast IS NOT NULL")).rows;
  } catch {
    return 0; // table not created yet
  }
  if (!subs.length) return 0;
  await refreshSubmissions(subs);
  const cutoff = Math.floor(Date.now() / 1000) - 90 * 86400;
  let n = 0;
  for (const s of subs) {
    let p;
    try {
      p = JSON.parse(s.podcast);
    } catch {
      continue;
    }
    const dump = (await c.execute({ sql: "SELECT slug FROM podcasts_new WHERE feed_url = ?", args: [p.feed_url] })).rows[0];
    if (dump) {
      if (dump.slug !== s.slug) {
        const taken = (await c.execute({ sql: "SELECT 1 FROM podcasts_new WHERE slug = ?", args: [s.slug] })).rows[0];
        if (!taken) await c.execute({ sql: "UPDATE podcasts_new SET slug = ? WHERE feed_url = ?", args: [s.slug, p.feed_url] });
      }
      continue;
    }
    if (Number(p.newest_pubdate) < cutoff) continue;
    const slugTaken = (await c.execute({ sql: "SELECT 1 FROM podcasts_new WHERE slug = ?", args: [s.slug] })).rows[0];
    if (slugTaken) continue;
    const scols = cols.filter((k) => k !== "id");
    await c.execute({
      sql: `INSERT INTO podcasts_new(${scols.join(",")}) VALUES(${scols.map(() => "?").join(",")})`,
      args: scols.map((k) => (k === "slug" ? s.slug : p[k] === undefined || p[k] === null ? null : p[k])),
    });
    n += 1;
  }
  return n;
}

// Re-read each submitted feed and refresh the stored row: episode count,
// newest date, score. A feed that cannot be read keeps its last known row.
async function refreshSubmissions(subs) {
  let lib;
  try {
    lib = await import("@profullstack/submit-feed");
  } catch {
    console.log("submit-feed not installed; merging submissions as stored");
    return;
  }
  const { resolveFeed } = lib;
  const nowS = Math.floor(Date.now() / 1000);
  let refreshed = 0;
  const queue = [...subs];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      let p;
      try { p = JSON.parse(s.podcast); } catch { continue; }
      const r = await resolveFeed(p.feed_url, { kind: "podcast", timeoutMs: 10_000, maxCandidates: 0,
        userAgent: "p0dcasters/1.0 (+https://p0dcasters.com; podcast directory refresh)" });
      if (!r.ok) continue;
      const eps = r.feed.items.filter((i) => i.media?.kind === "audio")
        .map((i) => ({ i, at: i.published ? Math.floor(Date.parse(i.published) / 1000) : 0 }))
        .sort((a, b) => b.at - a.at);
      const dated = eps.filter((e) => e.at > 0);
      if (!dated.length) continue;
      const newest = dated[0].at, oldest = dated[dated.length - 1].at, ec = eps.length;
      const span = newest > oldest ? (newest - oldest) / 86400 : null;
      const rate = span && span >= 7 ? ec / span : null;
      const ageD = (nowS - newest) / 86400;
      const fresh = ageD <= 7 ? 1 : ageD <= 30 ? 0.85 : ageD <= 60 ? 0.6 : 0.4;
      Object.assign(p, {
        title: r.feed.title || p.title,
        description: (r.feed.description || p.description).slice(0, 4000),
        image_url: r.feed.image ?? p.image_url,
        episode_count: ec, newest_pubdate: newest, oldest_pubdate: oldest,
        latest_audio: eps[0].i.media.url, latest_duration: eps[0].i.media.seconds,
        per_week: rate ? Math.round(rate * 7 * 100) / 100 : null,
        score: Math.round((Math.log1p(Math.min(ec, 500)) * fresh + Math.log1p((span ?? 0) / 30) * 0.5) * 10000) / 10000,
      });
      s.podcast = JSON.stringify(p);
      await c.execute({ sql: "UPDATE submissions SET podcast = ?, refreshed_at = ? WHERE id = ?", args: [s.podcast, nowS, s.id] });
      refreshed += 1;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log("submitted feeds re-read:", refreshed, "of", subs.length);
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
    ...(platformRows.length
      ? ["DROP TABLE IF EXISTS platform_hosts", "ALTER TABLE platform_hosts_new RENAME TO platform_hosts"]
      : []),
  ],
  "write",
);
console.log("swapped in");

// --- 3. verify ----------------------------------------------------------------
const n = Number((await c.execute("SELECT COUNT(*) AS n FROM podcasts")).rows[0].n);
const f = Number((await c.execute("SELECT COUNT(*) AS n FROM podcasts_fts")).rows[0].n);
console.log("remote podcasts:", n, "fts rows:", f);
const expected = rows.length + merged;
if (n !== expected || f !== expected) {
  console.error(`load_turso: remote has ${n} podcasts / ${f} fts rows, expected ${expected}`);
  process.exit(1);
}
