import { createClient } from "/home/anthony/p0dcasters/node_modules/@libsql/client/lib-esm/node.js";
import { DatabaseSync } from "node:sqlite";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const c = createClient({ url, authToken });

const local = new DatabaseSync("/home/anthony/p0dcasters-data/p0dcasters.db", { readOnly: true });

const DDL = `CREATE TABLE IF NOT EXISTS podcasts(
 id INTEGER PRIMARY KEY, slug TEXT NOT NULL, guid TEXT, feed_url TEXT NOT NULL, title TEXT NOT NULL,
 description TEXT NOT NULL, image_url TEXT NOT NULL, link TEXT, host TEXT NOT NULL,
 author TEXT, owner TEXT, explicit INTEGER NOT NULL DEFAULT 0, language TEXT, lang_base TEXT,
 category TEXT, categories TEXT, episode_count INTEGER NOT NULL, newest_pubdate INTEGER NOT NULL,
 oldest_pubdate INTEGER, created_on INTEGER, latest_audio TEXT, latest_duration INTEGER,
 generator TEXT, per_week REAL, score REAL NOT NULL)`;
await c.execute(DDL);
console.log("table created");

const cols = ["id","slug","guid","feed_url","title","description","image_url","link","host","author",
  "owner","explicit","language","lang_base","category","categories","episode_count","newest_pubdate",
  "oldest_pubdate","created_on","latest_audio","latest_duration","generator","per_week","score"];
const ph = cols.map(() => "?").join(",");
const sql = `INSERT INTO podcasts VALUES(${ph})`;

const rows = local.prepare(`SELECT ${cols.join(",")} FROM podcasts`).all();
console.log("local rows:", rows.length);

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
  if (done % 4000 === 0 || done === rows.length) console.log("inserted", done);
}

for (const s of [
  "CREATE UNIQUE INDEX IF NOT EXISTS i_slug ON podcasts(slug)",
  "CREATE INDEX IF NOT EXISTS i_cat ON podcasts(category)",
  "CREATE INDEX IF NOT EXISTS i_lang ON podcasts(lang_base)",
  "CREATE INDEX IF NOT EXISTS i_host ON podcasts(host)",
  "CREATE INDEX IF NOT EXISTS i_score ON podcasts(score DESC)",
  "CREATE INDEX IF NOT EXISTS i_new ON podcasts(newest_pubdate DESC)",
]) await c.execute(s);
console.log("indexes created");

await c.execute(`CREATE VIRTUAL TABLE IF NOT EXISTS podcasts_fts USING fts5(
 title, description, author, host, content='podcasts', content_rowid='id',
 tokenize='unicode61 remove_diacritics 2')`);
await c.execute(`INSERT INTO podcasts_fts(rowid,title,description,author,host)
 SELECT id,title,description,COALESCE(author,''),host FROM podcasts`);
await c.execute(`INSERT INTO podcasts_fts(podcasts_fts) VALUES('optimize')`);
console.log("fts built");

const n = await c.execute("SELECT COUNT(*) AS n FROM podcasts");
const f = await c.execute("SELECT COUNT(*) AS n FROM podcasts_fts");
console.log("remote podcasts:", n.rows[0].n, "fts rows:", f.rows[0].n);
