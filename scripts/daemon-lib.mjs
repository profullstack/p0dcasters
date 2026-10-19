// The directory refresh as a @profullstack/scraper-daemon pipeline.
//
// This is refresh-if-new-dump.sh (and the hourly crawlstats-watchdog.sh beside
// it) moved into one long-running process, the same package search.peptides,
// ch4nnels.com and r4ck.dev run. Every step still shells out to the scripts the
// shell version calls, with the same arguments, working directory and log, so a
// fix to build_live.py or load_directory.mjs lands in both. What the package adds:
//
//   * the schedule (every 6h, instead of cron),
//   * resume: a run that dies part way picks up at the step that failed, not at
//     the 1.8 GB download (the .dump-extracted-stamp shortcut still applies too),
//   * a done-token, so an unchanged dump is a one-HEAD "skipped" run,
//   * onStall after 13h without a success, which replaces the watchdog's email,
//   * status() for /api/v1/daemon.
//
// Nothing here is site-generic and nothing here touches the network or disk
// directly: buildDaemon() takes every side effect as a dependency, so the test
// can build it with fakes. scripts/daemon.mjs wires the real ones.

export const DUMP_URL = "https://public.podcastindex.org/podcastindex_feeds.db.tgz";
export const UA = "p0dcasters/1.0 (+https://p0dcasters.com)";
export const DATA = "/home/anthony/p0dcasters-data";
export const STEP_NAMES = ["download", "build_live", "export_indie", "row_floor", "load_directory", "seed_networks"];

/** The paths refresh-if-new-dump.sh uses, under one data dir. */
export function pathsFor(data = DATA) {
  return {
    data,
    stamp: `${data}/.last-dump-stamp`,
    dlStamp: `${data}/.dump-extracted-stamp`,
    log: `${data}/refresh.log`,
    runLog: `${data}/.daemon-run.log`,
    lock: `${data}/.refresh.lock`,
    tgz: `${data}/podcastindex_feeds.db.tgz`,
    part: `${data}/podcastindex_feeds.db.tgz.part`,
    dump: `${data}/podcastindex_feeds.db`,
    build: `${data}/p0dcasters.db`,
  };
}

/**
 * HEAD the dump and return its stamp, `last-modified|content-length` -- the
 * exact string refresh-if-new-dump.sh writes to .last-dump-stamp. null when
 * upstream cannot be reached or does not send both headers.
 *
 * @param {typeof fetch} fetchImpl
 */
export async function headStamp(fetchImpl, url = DUMP_URL, { signal, timeoutMs = 60_000 } = {}) {
  const t = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "HEAD",
      headers: { "user-agent": UA },
      signal: signal ? AbortSignal.any([signal, t]) : t,
    });
    if (!res.ok) return null;
    const lm = res.headers.get("last-modified")?.trim();
    const cl = res.headers.get("content-length")?.trim();
    return lm && cl ? `${lm}|${cl}` : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} deps
 * @param {Function} deps.createDaemon  from @profullstack/scraper-daemon
 * @param {object}   deps.store         pgStore(query) in production
 * @param {typeof fetch} deps.fetch     for the HEAD
 * @param {(cmd: string, args: string[], o?: {cwd?: string, env?: Record<string,string>, out?: string, capture?: boolean, signal?: AbortSignal}) => Promise<{code: number, stdout: string}>} deps.sh
 * @param {{read(p: string): string|null, write(p: string, s: string): void, size(p: string): number|null, rename(a: string, b: string): void, append(p: string, s: string): void, reset(p: string): void}} deps.files
 * @param {(args: string[]) => Promise<void>} deps.record   runs record_run.mjs (best effort)
 * @param {() => Promise<{url: string, source: string}|null>} deps.credential
 * @param {{acquire(): Promise<boolean>, release(): void}} deps.lock   the shell's flock
 * @param {(s: {job: string, lastOk: number|null, lastError: string|null}) => Promise<void>} [deps.alert]
 * @param {object} [deps.bin]   { node, bun, python }
 * @param {string} [deps.repo]  the checkout the scripts live in
 */
export function buildDaemon(deps) {
  const {
    createDaemon,
    store,
    redis = null,
    fetch: fetchImpl,
    sh,
    files,
    record,
    credential,
    lock,
    alert,
    console: out = console,
    now = Date.now,
    minRows = 10_000,
    loadTimeout = 1800,
    url = DUMP_URL,
    repo = "/home/anthony/www/p0dcasters.com/app",
    bin = {
      node: "/home/anthony/.local/share/mise/shims/node",
      bun: "/home/anthony/.local/share/mise/shims/bun",
      python: "/home/anthony/.local/share/mise/shims/python3",
    },
  } = deps;
  const P = pathsFor(deps.data);
  const scripts = `${repo}/scripts`;

  /** The run in progress: one at a time, the pipeline never overlaps itself. */
  let run = null;

  // Same line format as the shell's log(), into the shared refresh.log and this
  // run's own slice (which record_run.mjs stores beside the run on /crawlstats).
  function say(msg) {
    const line = `${new Date(now()).toISOString().replace(/\.\d+Z$/, "Z")} ${msg}\n`;
    try {
      files.append(P.log, line);
      if (run) files.append(P.runLog, line);
    } catch {}
    out.log(`[directory] ${msg}`);
  }

  function begin(token) {
    const d = new Date(now());
    run = {
      key: `${d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-daemon`,
      started: Math.floor(now() / 1000),
      step: "check",
      lm: null,
      cl: null,
      rows: null,
      before: null,
    };
    if (token) setToken(token);
    try {
      files.reset(P.runLog);
    } catch {}
  }

  function setToken(token) {
    const i = token.lastIndexOf("|");
    run.lm = token.slice(0, i);
    run.cl = token.slice(i + 1);
  }

  const dumpArgs = () => (run?.lm ? ["--dump-modified", run.lm, "--dump-bytes", String(run.cl)] : []);

  async function rec(status, step, extra = []) {
    if (!run) return;
    try {
      await record(["--key", run.key, "--started", String(run.started), "--log", P.runLog, "--status", status, "--step", step, ...extra]);
    } catch (err) {
      say(`record: could not write run status (${err?.message ?? err}) -- /crawlstats will not see this run`);
    }
  }

  async function finish(status, step, message, extra = []) {
    await rec(status, step, [...dumpArgs(), ...extra, "--message", message]);
    run = null;
    lock.release();
  }

  // A step reached without the gate (the package resuming a failed run) opens
  // the run itself: same lock, same bookkeeping.
  async function ensureRun(ctx) {
    if (run) return;
    if (!(await lock.acquire())) throw new Error(`another refresh holds ${P.lock}`);
    begin(ctx.token);
    say(`resuming at step ${ctx.step} for dump ${run.lm}`);
  }

  async function must(p, message) {
    const r = await p;
    if (r.code !== 0) throw new Error(message);
    return r;
  }

  const py = (script, signal) => sh(bin.python, [`${scripts}/${script}`], { cwd: P.data, out: P.log, signal });

  async function countRows(signal) {
    const r = await sh(
      bin.python,
      ["-c", `import sqlite3;print(sqlite3.connect('${P.build}').execute('SELECT COUNT(*) FROM podcasts').fetchone()[0])`],
      { cwd: P.data, capture: true, signal },
    );
    const n = Number(r.stdout.trim());
    if (r.code !== 0 || !Number.isFinite(n)) throw new Error("could not count rows in the new build");
    return n;
  }

  async function remoteCount(env, signal) {
    const r = await sh(bin.node, [`${scripts}/db_sql.mjs`, "SELECT COUNT(*) FROM podcasts"], { cwd: P.data, env, capture: true, signal }).catch(() => null);
    return r && r.code === 0 ? r.stdout.trim() : "";
  }

  async function gate(ctx) {
    if (!(await lock.acquire())) {
      say(`another refresh holds ${P.lock} -- leaving it alone`);
      return null;
    }
    begin();
    await rec("running", "check");
    const token = await headStamp(fetchImpl, url, { signal: ctx.signal });
    if (!token) {
      say("FAILED: HEAD request failed or sent no last-modified/content-length");
      await finish("failed", "check", "HEAD request failed or sent no last-modified/content-length");
      return null;
    }
    setToken(token);
    // .last-dump-stamp stays the source of truth, so a manual run of the old
    // script (which advances it) and this daemon agree on what is loaded.
    const prev = files.read(P.stamp);
    if (prev === token) await ctx.state.set("done", token);
    if (token === (await ctx.state.get("done"))) {
      say(`no new dump (${run.lm}) -- nothing to do`);
      await finish("skipped", "check", "no new dump upstream");
      return { token };
    }
    say(`new dump: ${run.lm} (${run.cl} bytes); previous: ${prev ?? "none"}`);
    return { token };
  }

  const steps = [
    {
      name: "download",
      async run(ctx) {
        await ensureRun(ctx);
        run.step = "download";
        // A previous attempt that got past extraction left the dump upstream is
        // still serving on disk: go straight to the build.
        if (files.read(P.dlStamp) === ctx.token && (files.size(P.dump) ?? 0) > 0) {
          say(`dump ${run.lm} is already downloaded and extracted -- resuming from build`);
          return { reused: true };
        }
        await rec("running", "download", dumpArgs());
        say("downloading ...");
        await must(
          sh("curl", ["-sS", "-L", "-A", UA, "-m", "3600", "--retry", "3", "--retry-delay", "30", "-o", P.part, url], { cwd: P.data, signal: ctx.signal }),
          "download failed",
        );
        const got = files.size(P.part);
        if (String(got) !== String(run.cl)) throw new Error(`size mismatch: got ${got}, expected ${run.cl}`);
        files.rename(P.part, P.tgz);
        say(`downloaded ${got} bytes; extracting ...`);
        run.step = "extract";
        await must(sh("tar", ["-xzf", P.tgz], { cwd: P.data, signal: ctx.signal }), "extract failed");
        files.write(P.dlStamp, ctx.token);
        return { bytes: got };
      },
    },
    {
      name: "build_live",
      async run(ctx) {
        await ensureRun(ctx);
        run.step = "build";
        await rec("running", "build", dumpArgs());
        say("building live subset ...");
        await must(py("build_live.py", ctx.signal), "build_live.py failed");
      },
    },
    {
      name: "export_indie",
      async run(ctx) {
        await ensureRun(ctx);
        run.step = "build";
        say("building indie cut ...");
        await must(py("export_indie.py", ctx.signal), "export_indie.py failed");
      },
    },
    {
      name: "row_floor",
      async run(ctx) {
        await ensureRun(ctx);
        run.step = "build";
        const rows = await countRows(ctx.signal);
        say(`built ${rows} podcasts`);
        if (rows < minRows) throw new Error(`only ${rows} rows (< ${minRows}) -- refusing to touch prod`);
        return { rows };
      },
    },
    {
      name: "load_directory",
      async run(ctx) {
        await ensureRun(ctx);
        run.step = "load";
        // Only past this point does prod change, and only in load_directory's
        // final swap transaction.
        const cred = await credential();
        if (!cred) throw new Error("no working database credential (environment, cache, vault) -- prod untouched");
        const env = { DATABASE_URL: cred.url };
        const rows = ctx.results.row_floor?.rows ?? (await countRows(ctx.signal));
        run.rows = rows;
        const before = await remoteCount(env, ctx.signal);
        run.before = before;
        await rec("running", "load", [...dumpArgs(), "--prev-count", before]);
        say(`loading into Postgres (credential: ${cred.source}; staged, then swapped in one transaction) ...`);
        await must(
          sh("timeout", ["-k", "30", String(loadTimeout), bin.node, `${scripts}/load_directory.mjs`], { cwd: P.data, env, out: P.log, signal: ctx.signal }),
          "load_directory.mjs failed -- the previous directory keeps serving unless the log says 'swapped in'; next scheduled run retries",
        );
        const remote = await remoteCount(env, ctx.signal);
        if (!remote || !(Number(remote) >= rows)) throw new Error(`prod has ${remote || "?"} rows, expected at least ${rows}`);
        files.write(P.stamp, ctx.token);
        say(`OK: ${rows} podcasts live (dump ${run.lm})`);
        return { rows, before };
      },
    },
    {
      name: "seed_networks",
      async run(ctx) {
        await ensureRun(ctx);
        // Best effort and after the swap: the directory is already live.
        try {
          const cred = await credential();
          const r = await sh("timeout", ["-k", "30", "1200", bin.bun, "scripts/seed_networks.ts"], {
            cwd: repo,
            env: cred ? { DATABASE_URL: cred.url } : {},
            out: P.log,
            signal: ctx.signal,
          });
          if (r.code !== 0) throw new Error(`exit ${r.code}`);
          return { seeded: true };
        } catch (err) {
          say(`seed_networks failed (non-fatal; ${err?.message ?? err}); see above`);
          return { seeded: false };
        }
      },
    },
  ];

  async function onRun(entry, result) {
    if (entry.job !== "directory" || !run) return;
    if (entry.ok && result?.results) {
      const rows = run.rows ?? result.results.load_directory?.rows;
      const before = run.before ?? result.results.load_directory?.before ?? "";
      await finish("ok", "load", `${rows} podcasts live`, ["--count", String(rows), "--prev-count", String(before)]);
    } else if (!entry.ok) {
      say(`FAILED: ${entry.error}`);
      await finish("failed", run.step, entry.error ?? "failed");
    } else {
      await finish("skipped", run.step, "nothing to do");
    }
  }

  const daemon = createDaemon({
    name: "p0dcasters.com",
    // BullMQ on this site's own Redis (deploy/redis.sh). Run records and status stay in Postgres
    // (`store`), where the web container's /api/v1/daemon reads them.
    redis,
    store,
    concurrency: 1,
    onRun,
    onStall: async (s) => {
      out.error(`[directory] stalled: no success since ${s.lastOk ? new Date(s.lastOk).toISOString() : "start"}${s.lastError ? `: ${s.lastError}` : ""}`);
      if (alert) await alert(s);
    },
  });

  daemon.pipeline({ name: "directory", every: "6h", timeout: "3h", staleAfter: "13h", gate, steps });
  return daemon;
}
