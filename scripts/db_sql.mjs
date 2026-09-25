// Run one SQL statement (or a file of them) against the directory database and
// print the result.
//
// The refresh script used to shell out to the Turso CLI for this, and the CLI
// answers "You are not logged in" on stdout with exit status 0 once its browser
// login has expired -- which is how a count came back as a sentence and the
// pipeline stalled for nine days. A database URL with the password in it has
// no login to expire.
//
//   node scripts/db_sql.mjs "SELECT COUNT(*) FROM podcasts"      # first cell
//   node scripts/db_sql.mjs --rows "SELECT slug, title FROM ..."  # TSV
//   node scripts/db_sql.mjs --file db/schema.pg.sql               # apply a file
//
// Exit 0 on success, 3 when the database rejected the credential or the
// request (the caller treats 3 as "get a fresh URL and retry"), 2 on usage.
import { readFileSync } from "node:fs";

import { createClient } from "@profullstack/libsql-pg";

const args = process.argv.slice(2);
const mode = args[0] === "--rows" ? "rows" : args[0] === "--file" ? "file" : "cell";
const sql = mode === "cell" ? args[0] : mode === "file" ? readFileSync(args[1], "utf8") : args[1];
if (!sql) {
  console.error("usage: db_sql.mjs [--rows|--file] SQL|FILE");
  process.exit(2);
}

const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error("db_sql: DATABASE_URL (postgres://...) is required");
  process.exit(3);
}

const c = createClient({ url, dialect: "postgres", pool: { max: 1 } });
try {
  if (mode === "file") {
    await c.executeMultiple(sql);
  } else {
    const rs = await c.execute(sql);
    if (mode === "rows") {
      for (const r of rs.rows) console.log(rs.columns.map((k) => String(r[k] ?? "")).join("\t"));
    } else if (rs.rows.length > 0) {
      console.log(String(rs.rows[0][rs.columns[0]] ?? ""));
    }
  }
} catch (err) {
  console.error("db_sql:", err.message);
  process.exit(3);
} finally {
  await c.close();
}
