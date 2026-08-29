// Records one refresh-pipeline run into `refresh_runs`, which is what
// /crawlstats reads.
//
// Called by scripts/refresh-if-new-dump.sh at each point the run changes state.
// It is bookkeeping: the caller ignores a non-zero exit rather than failing a
// rebuild over a lost status line. The one thing it must not do is lie, so a
// partial write is preferred to none -- the page shows a run stuck at "running"
// as an unfinished run, which is exactly what it is.
//
// Usage:
//   node record_run.mjs --key K --status running|skipped|ok|failed [options]
//     --step S            the stage reached, e.g. "download", "load"
//     --started N         unix seconds; defaults to now on the first write
//     --dump-modified S   upstream Last-Modified for the dump being considered
//     --dump-bytes N
//     --count N           podcasts live after this run
//     --prev-count N      podcasts live before it, for the delta
//     --message S
//     --log FILE          this run's own log lines, tail-truncated
//
// Every write is an upsert on --key, so the shell can call it repeatedly for
// one run without carrying a row id around.
import { readFileSync } from "node:fs";

import { createClient } from "@libsql/client";

// How much of a run's log to keep. A normal rebuild logs a dozen lines; a
// failing one can log a Python traceback per script, and there is no reason for
// the page to hold megabytes of it.
const LOG_MAX = 8000;
// Runs kept. At four checks a day this is about seven weeks of history, which
// covers several of the ~weekly rebuilds the charts are actually about.
const KEEP = 200;

const opts = parse(process.argv.slice(2));
if (!opts.key || !opts.status) {
  console.error("record_run: --key and --status are required");
  process.exit(2);
}

const url = process.env.TURSO_DATABASE_URL || "file:./data/p0dcasters.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const c = createClient(url.startsWith("file:") ? { url } : { url, authToken });

const now = Math.floor(Date.now() / 1000);
const done = opts.status !== "running";

// A category snapshot, taken only when a rebuild actually landed. `refresh_runs`
// is the only history the site keeps -- `podcasts` is dropped and reloaded whole,
// so a count taken today is unrecoverable tomorrow. One grouped read over the
// index is what makes the per-category sparklines possible at all.
let categories = null;
if (opts.status === "ok") {
  try {
    const rs = await c.execute(
      "SELECT COALESCE(category,'') AS c, COUNT(*) AS n FROM podcasts GROUP BY c",
    );
    categories = JSON.stringify(
      Object.fromEntries(rs.rows.map((r) => [String(r.c), Number(r.n)])),
    );
  } catch (err) {
    // The directory reload is the step that just succeeded, so this failing is
    // odd -- but it is a nicety, and the run record is not.
    console.error("record_run: category snapshot failed:", err.message);
  }
}

try {
  await c.execute({
    sql: `INSERT INTO refresh_runs
            (run_key, started_at, finished_at, status, step, dump_modified,
             dump_bytes, podcast_count, prev_count, categories, message, log)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(run_key) DO UPDATE SET
            finished_at   = excluded.finished_at,
            status        = excluded.status,
            step          = excluded.step,
            -- Only overwrite with something. A later call passes just the
            -- fields it learned, and must not blank what an earlier one knew.
            dump_modified = COALESCE(excluded.dump_modified, refresh_runs.dump_modified),
            dump_bytes    = COALESCE(excluded.dump_bytes,    refresh_runs.dump_bytes),
            podcast_count = COALESCE(excluded.podcast_count, refresh_runs.podcast_count),
            prev_count    = COALESCE(excluded.prev_count,    refresh_runs.prev_count),
            categories    = COALESCE(excluded.categories,    refresh_runs.categories),
            message       = COALESCE(excluded.message,       refresh_runs.message),
            log           = COALESCE(excluded.log,           refresh_runs.log)`,
    args: [
      opts.key,
      num(opts.started) ?? now,
      done ? now : null,
      opts.status,
      opts.step ?? null,
      opts["dump-modified"] ?? null,
      num(opts["dump-bytes"]),
      num(opts.count),
      num(opts["prev-count"]),
      categories,
      opts.message ?? null,
      tail(opts.log),
    ],
  });

  // Pruned here rather than on a schedule: this is the only process that ever
  // writes the table, so it is the only one that knows it has grown.
  if (done) {
    await c.execute({
      sql: `DELETE FROM refresh_runs WHERE id NOT IN
              (SELECT id FROM refresh_runs ORDER BY started_at DESC, id DESC LIMIT ?)`,
      args: [KEEP],
    });
  }

  console.log(`record_run: ${opts.key} ${opts.status}${opts.step ? ` (${opts.step})` : ""}`);
} catch (err) {
  console.error("record_run: write failed:", err.message);
  // 3 tells the caller to mint a fresh Turso token and try once more; the
  // cached one is the likeliest thing to have gone stale.
  process.exit(3);
}

/**
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function parse(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > -1) out[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      out[a.slice(2)] = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return out;
}

/**
 * libSQL cannot bind `undefined`: it throws remotely but binds as null against a
 * local file, so a dev run would never catch it. Everything optional goes
 * through here or an explicit `?? null`.
 *
 * @param {string|undefined} v
 * @returns {number|null}
 */
function num(v) {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string|undefined} file
 * @returns {string|null}
 */
function tail(file) {
  if (!file) return null;
  try {
    const text = readFileSync(file, "utf8");
    // Empty reads as null, not "". The upsert keeps an existing value only
    // through COALESCE, and "" is a value: the first call of a run, made before
    // anything has been logged, would otherwise blank what a later one wrote.
    if (!text) return null;
    return text.length > LOG_MAX ? text.slice(-LOG_MAX) : text;
  } catch {
    return null;
  }
}
