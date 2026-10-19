#!/usr/bin/env bun
// The p0dcasters.com updater daemon: the directory refresh on
// @profullstack/scraper-daemon (see daemon-lib.mjs for what it does).
//
// Runs on the HOST as anthony, not in the web container: the pipeline needs
// python3, ~/p0dcasters-data and gigabytes of disk and memory. systemd user
// unit deploy/p0dcasters-daemon.service; deploy/daemon-deploy.sh installs and
// restarts it after every deploy.
//
//   bun scripts/daemon.mjs            run forever
//   bun scripts/daemon.mjs --status   print the last status it stored
//   bun scripts/daemon.mjs --once     run the pipeline once now and exit
//
// State is in the site's Postgres (scraper_daemon_runs / scraper_daemon_state);
// the status it writes there every minute is what /api/v1/daemon serves.
import { spawn } from "node:child_process";
import { appendFileSync, closeSync, openSync, readFileSync, renameSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SQL } from "bun";
import { createDaemon, pgStore } from "@profullstack/scraper-daemon";

import { buildDaemon, pathsFor } from "./daemon-lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = pathsFor();
const HOME = "/home/anthony";
const LOGICSRC = `${HOME}/.local/bin/logicsrc`;
const BASE_ENV = {
  ...process.env,
  HOME,
  PATH: `${HOME}/.local/share/mise/shims:${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin`,
};
const ALERT_TO = process.env.ALERT_TO || "anthony@profullstack.com";
const log = (...a) => console.log("[p0dcasters.com]", ...a);

/* ---------- processes ---------- */

function sh(cmd, args, { cwd = P.data, env = {}, out, capture = false, signal } = {}) {
  return new Promise((resolve) => {
    let fd = null;
    if (out) fd = openSync(out, "a");
    const child = spawn(cmd, args, {
      cwd,
      env: { ...BASE_ENV, ...env },
      stdio: ["ignore", fd ?? (capture ? "pipe" : "inherit"), fd ?? "inherit"],
    });
    let stdout = "";
    child.stdout?.on("data", (d) => (stdout += d));
    const kill = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", kill, { once: true });
    const done = (code) => {
      signal?.removeEventListener("abort", kill);
      if (fd !== null) closeSync(fd);
      resolve({ code: code ?? 1, stdout });
    };
    child.on("error", () => done(127));
    child.on("close", (code) => done(code));
  });
}

/* ---------- files ---------- */

const files = {
  read: (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return null;
    }
  },
  write: (p, s) => writeFileSync(p, s),
  size: (p) => {
    try {
      return statSync(p).size;
    } catch {
      return null;
    }
  },
  rename: renameSync,
  append: appendFileSync,
  reset: (p) => writeFileSync(p, ""),
};

/* ---------- the shell's flock, so a manual run of the old script never overlaps ---------- */

let holder = null;
const lock = {
  acquire: () =>
    new Promise((resolve) => {
      if (holder) return resolve(true);
      const child = spawn("flock", ["-n", P.lock, "sh", "-c", "echo locked; exec cat"], { stdio: ["pipe", "pipe", "ignore"] });
      let settled = false;
      child.stdout.on("data", (d) => {
        if (!settled && String(d).includes("locked")) {
          settled = true;
          holder = child;
          resolve(true);
        }
      });
      child.on("close", () => {
        if (holder === child) holder = null;
        if (!settled) {
          settled = true;
          resolve(false);
        }
      });
    }),
  release: () => {
    holder?.stdin.end();
    holder = null;
  },
};

/* ---------- the database credential: environment, cache, vault (as the shell) ---------- */

async function vaultEnv(name) {
  const dir = mkdtempSync(join(P.data, ".vault-"));
  try {
    const f = join(dir, "env");
    const r = await sh(LOGICSRC, ["teams", "pull", "profullstack", "p0dcasters", "prod", "--env", f], { capture: true });
    if (r.code !== 0) return null;
    const line = (files.read(f) ?? "").split("\n").find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).replace(/["'\s\r]/g, "") : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function probe(url) {
  const sql = new SQL(url, { max: 1 });
  try {
    await sql.unsafe("SELECT 1");
    return true;
  } catch (err) {
    log(`probe failed: ${String(err?.message ?? err).replace(/(:\/\/[^:/@]*:)[^@]*@/g, "$1***@").slice(0, 300)}`);
    return false;
  } finally {
    await sql.close().catch(() => {});
  }
}

let cred = null;
async function credential() {
  if (cred) return cred;
  const tries = [
    ["env", async () => process.env.DATABASE_URL],
    ["cache", async () => files.read(`${P.data}/.database-url`)?.trim()],
    ["vault", () => vaultEnv("DATABASE_URL")],
  ];
  for (const [source, get] of tries) {
    const url = await get().catch(() => null);
    if (!url || !/^postgres(ql)?:\/\//.test(url)) continue;
    if (!(await probe(url))) continue;
    if (source === "vault") {
      writeFileSync(`${P.data}/.database-url`, url, { mode: 0o600 });
      log("database credential refreshed from vault");
    }
    cred = { url, source };
    return cred;
  }
  log("no working database credential: environment, cache and vault all failed");
  return null;
}

/* ---------- record_run.mjs, called exactly as the shell does ---------- */

async function record(args) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const c = await credential();
    if (!c) throw new Error("no credential");
    const r = await sh(BASE_ENV.HOME + "/.local/share/mise/shims/node", [`${REPO}/scripts/record_run.mjs`, ...args], {
      env: { DATABASE_URL: c.url },
      capture: true,
    });
    if (r.code === 0) return;
    // 3 is "the write was rejected": a rotated password, most likely.
    if (r.code !== 3) throw new Error(`record_run exit ${r.code}`);
    cred = null;
    if (attempt === 0) try { writeFileSync(`${P.data}/.database-url`, ""); } catch {}
  }
  throw new Error("record_run rejected twice");
}

/* ---------- the stall email (the watchdog's Resend alert) ---------- */

async function alert({ job, lastOk, lastError }) {
  let key = files.read(`${P.data}/.resend-key`)?.trim();
  if (!key) {
    key = await vaultEnv("RESEND_API_KEY");
    if (key) writeFileSync(`${P.data}/.resend-key`, key, { mode: 0o600 });
  }
  if (!key) return log("no Resend key (cache or vault) -- cannot email");
  const tail = (files.read(P.log) ?? "").split("\n").slice(-31).join("\n");
  const text =
    `The p0dcasters.com directory refresh (scraper-daemon pipeline "${job}") has not succeeded in 13 hours.\n\n` +
    `Last success: ${lastOk ? new Date(lastOk).toISOString() : "none since the daemon started"}.\n` +
    `Last error: ${lastError ?? "(none recorded)"}\n\n` +
    "The daemon keeps retrying on its own error ladder; this needs a person.\n" +
    "Unit: systemctl --user status p0dcasters-daemon (journalctl --user -u p0dcasters-daemon).\n" +
    "Status: https://p0dcasters.com/api/v1/daemon and https://p0dcasters.com/crawlstats\n\n" +
    `Tail of ~/p0dcasters-data/refresh.log:\n\n${tail}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: "p0dcasters <noreply@p0dcasters.com>", to: [ALERT_TO], subject: "[p0dcasters] directory refresh is stalled", text }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => ({ ok: false, text: async () => String(e) }));
  const body = await res.text();
  log(res.ok ? `alert emailed to ${ALERT_TO}` : `alert email failed: ${body.slice(0, 300)}`);
}

/* ---------- main ---------- */

const c = await credential();
if (!c) {
  console.error("p0dcasters daemon: no working DATABASE_URL; exiting (systemd retries)");
  process.exit(1);
}
const sql = new SQL(c.url, { max: 2 });
// pgStore with Bun's SQL: Bun JSON-encodes a string bound to a jsonb parameter
// (so `$2::jsonb`, already JSON text, would store a JSON string of the JSON), and
// it hands jsonb back parsed (so pgStore's JSON.parse of a string value breaks on
// a stored string like the done-token). Bind as text and read as text: pgStore
// then sees exactly the JSON text it wrote, and the column holds real objects.
const store = pgStore((text, params) =>
  sql.unsafe(text.replace(/::jsonb/g, "::text::jsonb").replace(/SELECT value FROM/g, "SELECT value::text AS value FROM"), params),
);

if (process.argv.includes("--status")) {
  console.log(JSON.stringify(await store.get("status"), null, 2));
  await sql.close();
  process.exit(0);
}

const daemon = buildDaemon({ createDaemon, store, fetch, sh, files, record, credential, lock, alert, repo: REPO });

async function writeStatus() {
  try {
    await store.set("status", { ...(await daemon.status()), updatedAt: Date.now() });
  } catch (err) {
    log(`status write failed: ${err?.message ?? err}`);
  }
}

if (process.argv.includes("--once")) {
  const outcome = await daemon.runNow("directory");
  await writeStatus();
  log("once:", JSON.stringify(outcome.ok ? outcome.result : { error: String(outcome.error?.message ?? outcome.error) }));
  await sql.close();
  process.exit(outcome.ok ? 0 : 1);
}

daemon.start();
await writeStatus();
const statusTimer = setInterval(writeStatus, 60_000);

let stopping = false;
async function shutdown(sig) {
  if (stopping) return;
  stopping = true;
  log(`${sig}: stopping`);
  clearInterval(statusTimer);
  await daemon.stop({ graceMs: 30_000 });
  await writeStatus();
  lock.release();
  await sql.close().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
