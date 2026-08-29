import { db } from "@/lib/db";

/** Days of history the growth chart covers, in rebuilds rather than dates. */
export const HISTORY_RUNS = 24;
/** Rows shown in the run table and the log panel. */
export const RUN_ROWS = 20;
/**
 * A show is dropped from the directory at the next rebuild once its newest
 * episode passes 90 days. This is the warning line: inside it, but not by much.
 */
export const CUTOFF_DAYS = 90;
export const NEAR_CUTOFF_DAYS = 75;
/** Cron runs the check every 6 hours; past this, nothing is running it. */
export const CHECK_INTERVAL_HOURS = 6;

const DAY = 86_400;

export type Bucket = { label: string; days: string; count: number };

export type CategoryRow = {
  category: string;
  shows: number;
  episodes: number;
  fresh7: number;
  stale: number;
  share: number;
  /** Shows in this category at each recorded rebuild, oldest first. */
  history: number[];
};

export type DirectoryStats = {
  shows: number;
  domains: number;
  episodes: number;
  languages: number;
  categories: number;
  fresh1: number;
  fresh7: number;
  fresh30: number;
  nearCutoff: number;
  buckets: Bucket[];
  newest: number | null;
  oldest: number | null;
  /** When these numbers were read. Everything relative is derived from it at render. */
  generatedAt: number;
};

export type ShowRow = {
  slug: string;
  title: string;
  host: string;
  episode_count: number;
  newest_pubdate: number;
};

export type Run = {
  id: number;
  run_key: string;
  started_at: number;
  finished_at: number | null;
  status: string;
  step: string | null;
  dump_modified: string | null;
  dump_bytes: number | null;
  podcast_count: number | null;
  prev_count: number | null;
  categories: string | null;
  message: string | null;
  log: string | null;
};

export type RefreshHistory = {
  runs: Run[];
  /** Only the runs that rebuilt the directory, newest first. */
  rebuilds: Run[];
  /** Present only when the table has not been created yet. */
  missing: boolean;
  lastCheck: Run | null;
  lastRebuild: Run | null;
  lastFailure: Run | null;
  checks24h: number;
  rebuilds30d: number;
  failures30d: number;
  /** Directory size at each rebuild that recorded one, oldest first. */
  sizes: { at: number; count: number }[];
};

/**
 * Everything the page says about the directory itself.
 *
 * One batch, one round trip. The freshness spread is asked as five running
 * totals rather than one grouped CASE: a conditional aggregate cannot use an
 * index, so it visits every row, while `newest_pubdate >= ?` is a seek down
 * i_new. At 21k rows either is fast — the point is that this page is public and
 * the shape stays right if the directory grows an order of magnitude.
 */
export async function directoryStats(): Promise<DirectoryStats> {
  const now = Math.floor(Date.now() / 1000);
  const since = (days: number) => now - days * DAY;

  const fresh = [1, 7, 14, 30, 60, NEAR_CUTOFF_DAYS, CUTOFF_DAYS];

  const rs = await db().batch(
    [
      {
        sql: `SELECT COUNT(*) AS shows,
                     COUNT(DISTINCT host) AS domains,
                     COALESCE(SUM(episode_count), 0) AS episodes,
                     COUNT(DISTINCT lang_base) AS languages,
                     COUNT(DISTINCT category) AS categories,
                     MAX(newest_pubdate) AS newest,
                     MIN(newest_pubdate) AS oldest
              FROM podcasts`,
        args: [],
      },
      ...fresh.map((days) => ({
        sql: "SELECT COUNT(*) AS n FROM podcasts WHERE newest_pubdate >= ?",
        args: [since(days)],
      })),
    ],
    "read",
  );

  const head = rs[0].rows[0] as unknown as Record<string, number | null>;
  const [d1, d7, d14, d30, d60, d75, d90] = fresh.map((_, i) =>
    Number((rs[i + 1].rows[0] as unknown as { n: number }).n ?? 0),
  );

  const shows = Number(head.shows ?? 0);

  // Each bucket is the difference between two running totals. The last one is
  // counted by complement — everything the 90-day total did not reach — which
  // is the same arithmetic as a fourth range scan and one fewer query.
  const buckets: Bucket[] = [
    { label: "This week", days: "0–7d", count: d7 },
    { label: "Two weeks", days: "8–14d", count: d14 - d7 },
    { label: "This month", days: "15–30d", count: d30 - d14 },
    { label: "Two months", days: "31–60d", count: d60 - d30 },
    { label: "Near cutoff", days: `61–${CUTOFF_DAYS}d`, count: d90 - d60 },
    { label: "Past cutoff", days: `>${CUTOFF_DAYS}d`, count: Math.max(shows - d90, 0) },
  ];

  return {
    shows,
    domains: Number(head.domains ?? 0),
    episodes: Number(head.episodes ?? 0),
    languages: Number(head.languages ?? 0),
    categories: Number(head.categories ?? 0),
    fresh1: d1,
    fresh7: d7,
    fresh30: d30,
    nearCutoff: Math.max(shows - d75, 0),
    buckets,
    newest: head.newest == null ? null : Number(head.newest),
    oldest: head.oldest == null ? null : Number(head.oldest),
    generatedAt: now,
  };
}

/**
 * The directory broken down by category, with each category's size at every
 * recorded rebuild.
 *
 * The history comes from the snapshots `refresh_runs` stores, not from
 * `podcasts` — the reload drops and rewrites that table whole, so a count taken
 * before the last rebuild does not exist anywhere else.
 */
export async function categoryStats(rebuilds: Run[]): Promise<CategoryRow[]> {
  const now = Math.floor(Date.now() / 1000);

  const rs = await db().batch(
    [
      {
        sql: `SELECT COALESCE(category, '') AS category,
                     COUNT(*) AS shows,
                     COALESCE(SUM(episode_count), 0) AS episodes
              FROM podcasts GROUP BY category ORDER BY shows DESC`,
        args: [],
      },
      {
        sql: `SELECT COALESCE(category, '') AS category, COUNT(*) AS n
              FROM podcasts WHERE newest_pubdate >= ? GROUP BY category`,
        args: [now - 7 * DAY],
      },
      {
        sql: `SELECT COALESCE(category, '') AS category, COUNT(*) AS n
              FROM podcasts WHERE newest_pubdate < ? GROUP BY category`,
        args: [now - 60 * DAY],
      },
    ],
    "read",
  );

  // Read out of a Map with a zero default, never positionally: a category with
  // no fresh shows this week simply does not come back from the second query.
  const fresh = mapOf(rs[1].rows as unknown as { category: string; n: number }[]);
  const stale = mapOf(rs[2].rows as unknown as { category: string; n: number }[]);

  const snapshots = rebuilds
    .filter((r) => r.categories)
    // .sort() is in place, and this array belongs to the caller.
    .slice()
    .sort((a, b) => a.started_at - b.started_at)
    .map((r) => parseCategories(r.categories))
    .filter((v): v is Record<string, number> => v !== null);

  const rows = rs[0].rows as unknown as {
    category: string;
    shows: number;
    episodes: number;
  }[];
  const total = rows.reduce((n, r) => n + Number(r.shows), 0) || 1;

  return rows.map((r) => {
    const category = String(r.category || "Uncategorised");
    const shows = Number(r.shows);

    return {
      category,
      shows,
      episodes: Number(r.episodes),
      fresh7: fresh.get(r.category) ?? 0,
      stale: stale.get(r.category) ?? 0,
      share: shows / total,
      history: snapshots.map((snap) => snap[r.category] ?? 0),
    };
  });
}

/**
 * What the pipeline has been doing, from the rows it writes about itself.
 *
 * Returns `missing: true` rather than throwing when the table is not there. The
 * pipeline owns that migration and the web service deploys independently of it,
 * so the window where one exists and the other does not is real, and it must
 * degrade to an honest empty page rather than a 500.
 */
export async function refreshHistory(): Promise<RefreshHistory> {
  const now = Math.floor(Date.now() / 1000);

  const empty: RefreshHistory = {
    runs: [],
    rebuilds: [],
    missing: true,
    lastCheck: null,
    lastRebuild: null,
    lastFailure: null,
    checks24h: 0,
    rebuilds30d: 0,
    failures30d: 0,
    sizes: [],
  };

  let rs;
  try {
    rs = await db().batch(
      [
        {
          sql: `SELECT * FROM refresh_runs ORDER BY started_at DESC LIMIT ?`,
          args: [RUN_ROWS],
        },
        // Rebuilds are asked for separately rather than filtered out of the
        // query above. They are perhaps one row in thirty — at four checks a
        // day, any window big enough to hold two dozen rebuilds is half a year
        // of skipped checks — so filtering the recent-runs window silently
        // capped the growth chart and every sparkline at three points.
        {
          sql: `SELECT * FROM refresh_runs
                WHERE status = 'ok' AND podcast_count IS NOT NULL
                ORDER BY started_at DESC LIMIT ?`,
          args: [HISTORY_RUNS],
        },
        // Asked for on its own, for the same reason as the rebuilds: a failure
        // older than the twenty rows above still has to be findable, or the
        // page reports "1 failed in the last 30 days" beside a dash where the
        // failure should be.
        {
          sql: `SELECT * FROM refresh_runs WHERE status = 'failed'
                ORDER BY started_at DESC LIMIT 1`,
          args: [],
        },
        {
          sql: `SELECT COUNT(*) AS n FROM refresh_runs WHERE started_at >= ?`,
          args: [now - DAY],
        },
        {
          sql: `SELECT status, COUNT(*) AS n FROM refresh_runs
                WHERE started_at >= ? GROUP BY status`,
          args: [now - 30 * DAY],
        },
      ],
      "read",
    );
  } catch {
    return empty;
  }

  const runs = rs[0].rows as unknown as Run[];
  const rebuilds = rs[1].rows as unknown as Run[];
  // Read out of a Map with a zero default, never positionally: a status with no
  // rows in the window simply does not come back.
  const byStatus = new Map(
    (rs[4].rows as unknown as { status: string; n: number }[]).map((r) => [
      String(r.status),
      Number(r.n),
    ]),
  );

  return {
    runs,
    rebuilds,
    missing: false,
    lastCheck: runs[0] ?? null,
    lastRebuild: rebuilds[0] ?? null,
    lastFailure: (rs[2].rows[0] as unknown as Run) ?? null,
    checks24h: Number((rs[3].rows[0] as unknown as { n: number }).n ?? 0),
    rebuilds30d: byStatus.get("ok") ?? 0,
    failures30d: byStatus.get("failed") ?? 0,
    sizes: rebuilds
      .slice()
      .reverse()
      .map((r) => ({ at: r.started_at, count: Number(r.podcast_count) })),
  };
}

/** The 15 shows that published most recently, and the 15 closest to dropping out. */
export async function edgeShows(): Promise<{ newest: ShowRow[]; oldest: ShowRow[] }> {
  const cols = "slug, title, host, episode_count, newest_pubdate";
  const rs = await db().batch(
    [
      {
        sql: `SELECT ${cols} FROM podcasts ORDER BY newest_pubdate DESC LIMIT 15`,
        args: [],
      },
      {
        sql: `SELECT ${cols} FROM podcasts ORDER BY newest_pubdate ASC LIMIT 15`,
        args: [],
      },
    ],
    "read",
  );

  return {
    newest: rs[0].rows as unknown as ShowRow[],
    oldest: rs[1].rows as unknown as ShowRow[],
  };
}

/**
 * Healthy, degraded or stalled.
 *
 * Derived from the check heartbeat rather than from a rebuild: rebuilds are
 * conditional and a fortnight without one is normal when Podcast Index has not
 * republished. What is never normal is the check itself going quiet, because
 * cron is supposed to run it every six hours whatever upstream is doing.
 */
export function health(history: RefreshHistory, now: number) {
  if (history.missing || !history.lastCheck) {
    return { state: "unknown" as const, since: null };
  }

  const idleHours = (now - history.lastCheck.started_at) / 3600;

  // Two missed checks, not one: a cron tick landing a few minutes late, or a
  // rebuild still running from the last one, is not an outage.
  if (idleHours > CHECK_INTERVAL_HOURS * 2) {
    return { state: "stalled" as const, since: idleHours };
  }
  if (history.lastCheck.status === "failed") {
    return { state: "degraded" as const, since: idleHours };
  }
  // A run that started and never reported an end, while a later one has come
  // and gone, was killed part way through.
  if (history.lastCheck.status === "running" && idleHours > CHECK_INTERVAL_HOURS) {
    return { state: "degraded" as const, since: idleHours };
  }
  return { state: "healthy" as const, since: idleHours };
}

/**
 * @param rows any grouped `category, n` result
 */
function mapOf(rows: { category: string; n: number }[]): Map<string, number> {
  return new Map(rows.map((r) => [String(r.category ?? ""), Number(r.n)]));
}

function parseCategories(json: string | null): Record<string, number> | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : null;
  } catch {
    return null;
  }
}
