import {
  CHECK_INTERVAL_HOURS,
  CUTOFF_DAYS,
  categoryStats,
  directoryStats,
  edgeShows,
  health,
  refreshHistory,
} from "@/lib/crawlstats";

/**
 * The /crawlstats numbers, for anything that would rather poll JSON than parse
 * a page — a monitor that wants to alert on `health.state`, mostly.
 *
 * Uncached for the same reason the page is: every relative figure here is
 * measured against the moment of the request, and a cached copy of "checked 20
 * minutes ago" is the exact lie this endpoint exists to prevent.
 *
 * The `log` of the last run is deliberately not included. It is the one field
 * that can carry a stack trace with paths from the build machine in it, and a
 * public JSON endpoint is not where that belongs; the page shows it because a
 * person reading it is the point.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const history = await refreshHistory();
  const [stats, categories, edges] = await Promise.all([
    directoryStats(),
    categoryStats(history.rebuilds),
    edgeShows(),
  ]);

  const now = Math.floor(Date.now() / 1000);
  const state = health(history, now);

  return Response.json(
    {
      health: {
        state: state.state,
        idleHours: state.since == null ? null : Number(state.since.toFixed(2)),
        checkIntervalHours: CHECK_INTERVAL_HOURS,
      },
      directory: {
        shows: stats.shows,
        domains: stats.domains,
        episodes: stats.episodes,
        languages: stats.languages,
        categories: stats.categories,
        publishedLastDay: stats.fresh1,
        publishedLastWeek: stats.fresh7,
        publishedLastMonth: stats.fresh30,
        nearCutoff: stats.nearCutoff,
        cutoffDays: CUTOFF_DAYS,
        newestEpisodeAt: iso(stats.newest),
        oldestEpisodeAt: iso(stats.oldest),
        freshness: stats.buckets,
      },
      pipeline: {
        recorded: !history.missing,
        lastCheckAt: iso(history.lastCheck?.started_at ?? null),
        lastCheckStatus: history.lastCheck?.status ?? null,
        lastRebuildAt: iso(history.lastRebuild?.started_at ?? null),
        lastRebuildShows: history.lastRebuild?.podcast_count ?? null,
        lastRebuildChange:
          history.lastRebuild?.podcast_count != null && history.lastRebuild.prev_count != null
            ? history.lastRebuild.podcast_count - history.lastRebuild.prev_count
            : null,
        lastFailureAt: iso(history.lastFailure?.started_at ?? null),
        lastFailureMessage: history.lastFailure?.message ?? null,
        dumpModified: history.lastRebuild?.dump_modified ?? null,
        checksLastDay: history.checks24h,
        rebuildsLastMonth: history.rebuilds30d,
        failuresLastMonth: history.failures30d,
        sizes: history.sizes.map((s) => ({ at: iso(s.at), shows: s.count })),
        runs: history.runs.slice(0, 20).map((r) => ({
          startedAt: iso(r.started_at),
          finishedAt: iso(r.finished_at),
          status: r.status,
          step: r.step,
          dumpModified: r.dump_modified,
          shows: r.podcast_count,
          previousShows: r.prev_count,
          message: r.message,
        })),
      },
      categories: categories.map((c) => ({
        category: c.category,
        shows: c.shows,
        episodes: c.episodes,
        share: Number(c.share.toFixed(4)),
        publishedLastWeek: c.fresh7,
        quiet60d: c.stale,
      })),
      recentlyPublished: edges.newest.map(show),
      nearestCutoff: edges.oldest.map(show),
      generatedAt: new Date(now * 1000).toISOString(),
    },
    // No shared cache: see above. `no-store` rather than a short s-maxage
    // because a monitor polling a 60-second CDN copy would report the pipeline
    // healthy for a minute after it stopped, which is the wrong direction to
    // be wrong in.
    { headers: { "cache-control": "no-store" } },
  );
}

function show(row: {
  slug: string;
  title: string;
  host: string;
  episode_count: number;
  newest_pubdate: number;
}) {
  return {
    slug: row.slug,
    title: row.title,
    host: row.host,
    episodes: row.episode_count,
    newestEpisodeAt: iso(row.newest_pubdate),
    url: `https://p0dcasters.com/podcast/${row.slug}`,
  };
}

function iso(unix: number | null): string | null {
  return unix == null ? null : new Date(unix * 1000).toISOString();
}
