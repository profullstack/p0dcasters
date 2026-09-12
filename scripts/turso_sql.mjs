// Run one SQL statement against the directory database and print the result.
//
// The refresh script used to shell out to the Turso CLI for this, and the CLI
// answers "You are not logged in" on stdout with exit status 0 once its browser
// login has expired -- which is how a count came back as a sentence and the
// pipeline stalled for nine days without a single failing command. The libSQL
// client with a database token has no login to expire.
//
//   node scripts/turso_sql.mjs "SELECT COUNT(*) FROM podcasts"      # first cell
//   node scripts/turso_sql.mjs --rows "SELECT slug, title FROM ..."  # TSV
//
// Exit 0 on success, 3 when the database rejected the credential or the
// request (the caller treats 3 as "get a fresh token and retry"), 2 on usage.
import { createClient } from "@libsql/client";

const args = process.argv.slice(2);
const asRows = args[0] === "--rows";
const sql = asRows ? args[1] : args[0];
if (!sql) {
  console.error("usage: turso_sql.mjs [--rows] SQL");
  process.exit(2);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || (!url.startsWith("file:") && !authToken)) {
  console.error("turso_sql: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
  process.exit(3);
}

try {
  const c = createClient(url.startsWith("file:") ? { url } : { url, authToken });
  const rs = await c.execute(sql);
  if (asRows) {
    for (const r of rs.rows) console.log(rs.columns.map((k) => String(r[k] ?? "")).join("\t"));
  } else if (rs.rows.length > 0) {
    console.log(String(rs.rows[0][rs.columns[0]] ?? ""));
  }
} catch (err) {
  console.error("turso_sql:", err.message);
  process.exit(3);
}
