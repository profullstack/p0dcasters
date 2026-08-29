import type { Metadata } from "next";
import Link from "next/link";

import {
  CHECK_INTERVAL_HOURS,
  CUTOFF_DAYS,
  NEAR_CUTOFF_DAYS,
  RUN_ROWS,
  categoryStats,
  directoryStats,
  edgeShows,
  health,
  refreshHistory,
  type Run,
} from "@/lib/crawlstats";
import { timeAgo, titleCase } from "@/lib/format";
import { FreshnessChart, GrowthChart, Sparkline } from "./Charts";

// Every number here is measured against now. A cached copy of this page would
// report a cheerful "checked 20 minutes ago" for as long as the cache lived,
// which is the one failure the page exists to catch.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crawl status",
  description:
    "Live status of the p0dcasters directory: when the Podcast Index dump was last read, how many shows are listed, and which are about to fall out.",
  alternates: { canonical: "/crawlstats" },
};

/**
 * What the pipeline behind the directory is doing.
 *
 * The site can be perfectly healthy while the thing that feeds it has been dead
 * for a month. Nothing about that is visible from outside: the pages still
 * render, the shows are still there, and they quietly describe a directory that
 * stopped being true in August. That failure gets a page.
 *
 * "Crawl" here is one weekly-ish pass, not a continuous poller. p0dcasters does
 * not fetch 21,000 feeds itself — it takes the Podcast Index dump, cuts the
 * independent shows out of it, and replaces the directory wholesale. So the
 * questions this page answers are: is the cron check still running, when did a
 * rebuild last land, what did it change, and how much of the directory is
 * drifting towards the 90-day cutoff that will drop it.
 *
 * Deliberately not monetised, like /opml and /api/* — a status board is
 * something you open when you are worried, not somewhere to sell a rectangle.
 */
export default async function CrawlStatsPage() {
  // The run history is needed before the category breakdown, which reads its
  // per-rebuild snapshots. The other two are independent of both.
  const history = await refreshHistory();
  const [stats, categories, edges] = await Promise.all([
    directoryStats(),
    categoryStats(history.rebuilds),
    edgeShows(),
  ]);

  const now = Math.floor(Date.now() / 1000);
  const state = health(history, now);
  const runs = history.runs.slice(0, RUN_ROWS);
  // The feeds declare their own categories, and the tail of that is long: about
  // three quarters of the categories hold fewer than ten shows between them.
  // Listing all 56 buries the twenty that describe the directory, so the tail is
  // folded into one row rather than dropped — the total still has to add up.
  const topCategories = categories.slice(0, CATEGORY_ROWS);
  const tailCategories = categories.slice(CATEGORY_ROWS);
  const lastRebuild = history.lastRebuild;
  const dumpAge = lastRebuild?.dump_modified ? Date.parse(lastRebuild.dump_modified) : NaN;

  return (
    <div className="wrap">
      <section className="crawl">
        <h1>Crawl status</h1>
        <p className="lede">
          The directory is rebuilt from the{" "}
          <a href="https://podcastindex.org">Podcast Index</a> public dump, checked every{" "}
          {CHECK_INTERVAL_HOURS} hours and rebuilt only when that dump actually moves. This
          is what that pipeline has been doing. The same numbers are{" "}
          <Link href="/api/crawlstats">JSON</Link>.
        </p>

        <p className={`crawl-health crawl-health-${state.state}`}>
          <strong>{LABELS[state.state]}</strong>{" "}
          {state.state === "unknown"
            ? "No run has been recorded yet, so nothing here can be said about the pipeline. Everything below describes the directory as it currently stands."
            : state.state === "stalled"
              ? `Nothing has checked for a new dump in ${hours(state.since)}. Cron runs that check every ${CHECK_INTERVAL_HOURS} hours, so it is not running.`
              : state.state === "degraded"
                ? `The last run did not finish: ${history.lastCheck?.message ?? "no reason recorded"}.`
                : `Checked for a new dump ${timeAgo(history.lastCheck!.started_at)}; the directory was last rebuilt ${lastRebuild ? timeAgo(lastRebuild.started_at) : "at some point before this page existed"}.`}
        </p>

        <div className="stat-grid">
          <Stat label="Shows" value={fmt(stats.shows)} note={`${fmt(stats.domains)} domains`} />
          <Stat label="Episodes" value={fmt(stats.episodes)} note="across the directory" />
          <Stat
            label="Published (24h)"
            value={fmt(stats.fresh1)}
            note="as of the last dump"
          />
          <Stat label="Published (7d)" value={fmt(stats.fresh7)} note={`${pct(stats.fresh7, stats.shows)} of the directory`} />
          <Stat
            label="Near cutoff"
            value={fmt(stats.nearCutoff)}
            note={`quiet ${NEAR_CUTOFF_DAYS}d+, drop at ${CUTOFF_DAYS}d`}
          />
          <Stat label="Languages" value={fmt(stats.languages)} note={`${fmt(stats.categories)} categories`} />
          <Stat
            label="Checks (24h)"
            value={fmt(history.checks24h)}
            note={`${24 / CHECK_INTERVAL_HOURS} expected`}
          />
          <Stat
            label="Rebuilds (30d)"
            value={fmt(history.rebuilds30d)}
            note={history.failures30d ? `${fmt(history.failures30d)} failed` : "none failed"}
          />
        </div>

        <p className="crawl-meta">
          Last check {history.lastCheck ? timeAgo(history.lastCheck.started_at) : "never"} · last
          rebuild {lastRebuild ? timeAgo(lastRebuild.started_at) : "never"} · dump published{" "}
          {Number.isNaN(dumpAge) ? "unknown" : timeAgo(Math.floor(dumpAge / 1000))} · newest
          episode in the directory{" "}
          {stats.newest ? timeAgo(stats.newest) : "unknown"} · generated{" "}
          {new Date(stats.generatedAt * 1000).toISOString()}
        </p>

        <h2>Pipeline</h2>
        <p>
          Four stages, and they have opposite shapes. <strong>The check</strong> should run
          like a clock: one HEAD request every {CHECK_INTERVAL_HOURS} hours, and its
          absence is the only outage this page can see on its own.{" "}
          <strong>The rebuild</strong> is supposed to be idle most of the time — it fires
          only when Podcast Index republishes, roughly weekly, and running it against an
          unchanged dump would quietly shrink the directory rather than refresh it, because
          inclusion is recomputed as &ldquo;published within {CUTOFF_DAYS} days&rdquo; every
          time. So a run of skipped checks is the system working, and a rebuild every night
          would be the bug.
        </p>

        <table className="crawl-table job-table">
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col">State</th>
              <th scope="col">Cadence</th>
              <th scope="col">Last ran</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            <Stage
              label="Dump check"
              what="one HEAD request for the dump's Last-Modified"
              state={
                state.state === "stalled" ? "stalled" : state.state === "unknown" ? "unknown" : "ok"
              }
              cadence={`every ${CHECK_INTERVAL_HOURS}h`}
              at={history.lastCheck?.started_at ?? null}
              result={
                history.lastCheck
                  ? history.lastCheck.status === "skipped"
                    ? "no new dump"
                    : history.lastCheck.status
                  : "—"
              }
            />
            <Stage
              label="Rebuild"
              what="download, extract, cut the independent shows out"
              state={history.lastFailure && history.lastFailure === history.lastCheck ? "failed" : lastRebuild ? "ok" : "unknown"}
              cadence="when the dump moves"
              at={lastRebuild?.started_at ?? null}
              result={
                lastRebuild?.podcast_count != null
                  ? `${fmt(lastRebuild.podcast_count)} shows built`
                  : "—"
              }
            />
            <Stage
              label="Load"
              what="drop and reload the directory tables in Turso"
              state={lastRebuild ? "ok" : "unknown"}
              cadence="with each rebuild"
              at={lastRebuild?.finished_at ?? null}
              result={
                lastRebuild?.podcast_count != null && lastRebuild.prev_count != null
                  ? delta(lastRebuild.podcast_count - lastRebuild.prev_count)
                  : lastRebuild
                    ? "loaded"
                    : "—"
              }
            />
            <Stage
              label="Episodes"
              what="read live from each publisher when a show page is opened"
              state="ok"
              cadence="on demand, cached 30m"
              at={null}
              result="never stored"
            />
          </tbody>
        </table>

        <h2>Recent runs</h2>
        {history.missing ? (
          <p className="crawl-note">
            The <code>refresh_runs</code> table does not exist yet — run{" "}
            <code>node scripts/migrate_runs.mjs</code>. Until then the pipeline has no way to
            report itself and everything above about it reads as unknown.
          </p>
        ) : runs.length === 0 ? (
          <p className="crawl-note">Nothing recorded yet. The next cron check writes the first row.</p>
        ) : (
          <table className="crawl-table">
            <thead>
              <tr>
                <th scope="col">Started</th>
                <th scope="col">Result</th>
                <th scope="col">Stage</th>
                <th scope="col">Dump</th>
                <th scope="col" className="num">Shows</th>
                <th scope="col" className="num">Change</th>
                <th scope="col" className="num">Took</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.run_key}>
                  <td title={new Date(run.started_at * 1000).toISOString()}>
                    {timeAgo(run.started_at)}
                  </td>
                  <td>
                    <span className={`job-state job-state-${run.status}`}>{run.status}</span>
                    {run.message && <span className="job-what">{run.message}</span>}
                  </td>
                  <td>{run.step ?? "—"}</td>
                  <td className="crawl-dump">{shortDump(run.dump_modified)}</td>
                  <td className="num">
                    {run.podcast_count == null ? "—" : fmt(run.podcast_count)}
                  </td>
                  <td className="num">
                    {run.podcast_count == null || run.prev_count == null
                      ? "—"
                      : delta(run.podcast_count - run.prev_count)}
                  </td>
                  <td className="num">{took(run)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>Last run log</h2>
        <p>
          What the pipeline wrote about itself, verbatim. Only the most recent run is kept
          here; the full history is a log file on the machine that runs it.
        </p>
        <pre className="crawl-log">
          {history.lastCheck?.log?.trimEnd() ||
            "No log recorded for the last run."}
        </pre>

        <h2>Directory over time</h2>
        <p>
          Every rebuild replaces the directory whole, so its size is the one number that
          says what a rebuild did. A pass against an unchanged dump only slides the{" "}
          {CUTOFF_DAYS}-day cutoff forward and takes shows out — a run on 2026-08-28 cut 21
          of 21,628 — which is exactly why the check is conditional.
        </p>
        <GrowthChart series={history.sizes} />

        <h2>Freshness</h2>
        <p>
          How long ago each listed show last published. This is the closest thing here to a
          crawler&rsquo;s health chart: the two right-hand bands are what the next rebuild
          removes, and a directory drifting rightward is one that has not been rebuilt in a
          while.
        </p>
        <p>
          Read the left-hand bands with the lag in mind. Episode dates come from the dump,
          and the dump is published roughly weekly, so the most recent day or two is always
          thin here however busy the shows themselves have been — a near-empty
          &ldquo;published in the last 24 hours&rdquo; means the dump is a week old, not
          that 22,000 podcasts went quiet. The whole histogram slides left again on the
          next rebuild.
        </p>
        <FreshnessChart buckets={stats.buckets} />

        <h2>By category</h2>
        <p>
          Categories come from the feeds themselves, not from us. The sparkline is that
          category&rsquo;s size at each rebuild on record — it starts empty and fills in one
          point per rebuild, because the directory table is replaced wholesale and keeps no
          history of its own.
        </p>

        <table className="crawl-table category-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col" className="num">Shows</th>
              <th scope="col" className="num">Share</th>
              <th scope="col" className="num">Episodes</th>
              <th scope="col" className="num">Published (7d)</th>
              <th scope="col" className="num">Quiet 60d+</th>
              <th scope="col">Trend</th>
            </tr>
          </thead>
          <tbody>
            {topCategories.map((row) => (
              <tr key={row.category}>
                <td className="category-name">
                  {row.category === "Uncategorised" ? (
                    row.category
                  ) : (
                    <Link href={`/category/${encodeURIComponent(row.category)}`}>
                      {titleCase(row.category)}
                    </Link>
                  )}
                </td>
                <td className="num">{fmt(row.shows)}</td>
                <td className="num">
                  <Share share={row.share} />
                </td>
                <td className="num">{fmt(row.episodes)}</td>
                <td className="num">{row.fresh7 ? fmt(row.fresh7) : "—"}</td>
                <td className="num">{row.stale ? fmt(row.stale) : "—"}</td>
                <td className="spark-cell">
                  <Sparkline
                    values={row.history}
                    label={`${titleCase(row.category)}: ${fmt(row.history[0] ?? row.shows)} shows at the first recorded rebuild, ${fmt(row.shows)} now`}
                  />
                </td>
              </tr>
            ))}
            {tailCategories.length > 0 && (
              <tr>
                <td className="category-name">
                  {tailCategories.length} smaller categories
                  <span className="job-what">
                    {tailCategories
                      .slice(0, 6)
                      .map((c) => titleCase(c.category))
                      .join(", ")}
                    {tailCategories.length > 6 ? ", and more" : ""}
                  </span>
                </td>
                <td className="num">{fmt(sum(tailCategories, "shows"))}</td>
                <td className="num">
                  <Share share={tailCategories.reduce((n, c) => n + c.share, 0)} />
                </td>
                <td className="num">{fmt(sum(tailCategories, "episodes"))}</td>
                <td className="num">{fmt(sum(tailCategories, "fresh7"))}</td>
                <td className="num">{fmt(sum(tailCategories, "stale"))}</td>
                <td />
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="category-name">All shows</td>
              <td className="num">{fmt(stats.shows)}</td>
              <td className="num">100%</td>
              <td className="num">{fmt(stats.episodes)}</td>
              <td className="num">{fmt(stats.fresh7)}</td>
              <td className="num">{fmt(sum(categories, "stale"))}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        <h2>Published most recently</h2>
        <ShowTable rows={edges.newest} column="Last episode" />

        <h2>Closest to the cutoff</h2>
        <p>
          A show leaves the directory when its newest episode passes {CUTOFF_DAYS} days.
          These are the ones nearest that line — the analogue of a failing feed, except
          nothing is failing: they have simply stopped publishing, and the next rebuild will
          be the one that drops them.
        </p>
        <ShowTable rows={edges.oldest} column="Last episode" drops />
      </section>
    </div>
  );
}

/** Categories listed individually; the rest fold into one row. */
const CATEGORY_ROWS = 20;

const LABELS = {
  healthy: "Healthy",
  degraded: "Degraded",
  stalled: "Stalled",
  unknown: "Unknown",
} as const;

function ShowTable({
  rows,
  column,
  drops = false,
}: {
  rows: { slug: string; title: string; host: string; episode_count: number; newest_pubdate: number }[];
  column: string;
  drops?: boolean;
}) {
  if (rows.length === 0) return <p className="crawl-note">Nothing to show.</p>;

  const cutoff = CUTOFF_DAYS * 86_400;
  const now = Math.floor(Date.now() / 1000);

  return (
    <table className="crawl-table">
      <thead>
        <tr>
          <th scope="col">Show</th>
          <th scope="col">Domain</th>
          <th scope="col" className="num">Episodes</th>
          <th scope="col" className="num">{column}</th>
          {drops && <th scope="col" className="num">Drops in</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.slug}>
            <td className="show-name" title={row.title}>
              <Link href={`/podcast/${row.slug}`}>{row.title}</Link>
            </td>
            <td className="crawl-host">{row.host}</td>
            <td className="num">{fmt(row.episode_count)}</td>
            <td className="num">{timeAgo(row.newest_pubdate)}</td>
            {drops && (
              <td className="num">
                {(() => {
                  const left = Math.round((row.newest_pubdate + cutoff - now) / 86_400);
                  return left <= 0 ? "next rebuild" : `${left}d`;
                })()}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stage({
  label,
  what,
  state,
  cadence,
  at,
  result,
}: {
  label: string;
  what: string;
  state: string;
  cadence: string;
  at: number | null;
  result: string;
}) {
  return (
    <tr>
      <td>
        <strong>{label}</strong>
        <span className="job-what">{what}</span>
      </td>
      <td>
        <span className={`job-state job-state-${state}`}>{state}</span>
      </td>
      <td>{cadence}</td>
      <td className="num">{at ? timeAgo(at) : "—"}</td>
      <td className="num">{result}</td>
    </tr>
  );
}

/**
 * A category's share of the directory, as a number with a bar behind it. The bar
 * is the reason the column exists: 9,000 of 21,600 is a sentence, and a row of
 * them is a shape you can read in one pass.
 */
function Share({ share }: { share: number }) {
  return (
    <span className="share">
      <span className="share-bar" aria-hidden="true">
        <span
          className="share-fill"
          style={{ width: `${Math.max(share * 100, share > 0 ? 1 : 0)}%` }}
        />
      </span>
      <span className="share-value">{pctOf(share)}</span>
    </span>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

function fmt(n: number): string {
  return Number(n ?? 0).toLocaleString("en-US");
}

function sum<K extends string>(rows: Record<K, number>[], key: K): number {
  return rows.reduce((n, r) => n + Number(r[key] ?? 0), 0);
}

function delta(n: number): string {
  if (n === 0) return "no change";
  return `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
}

function pct(n: number, total: number): string {
  return pctOf(total ? n / total : 0);
}

function pctOf(share: number): string {
  const p = share * 100;
  return p === 0 ? "0%" : p < 0.1 ? "<0.1%" : `${p.toFixed(p < 10 ? 1 : 0)}%`;
}

function hours(n: number | null): string {
  if (n == null) return "an unknown time";
  if (n < 48) return `${Math.round(n)} hours`;
  return `${Math.round(n / 24)} days`;
}

/** `Sun, 23 Aug 2026 19:51:14 GMT` is a column and a half. The date is the part that identifies it. */
function shortDump(lm: string | null): string {
  if (!lm) return "—";
  const t = Date.parse(lm);
  return Number.isNaN(t) ? lm : new Date(t).toISOString().slice(0, 10);
}

function took(run: Run): string {
  if (!run.finished_at) return run.status === "running" ? "running" : "—";
  const s = run.finished_at - run.started_at;
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}
