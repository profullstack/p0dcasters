// The show crawler: keeps the directory's "newest episode" current between dumps.
//
// The directory itself comes from the Podcast Index dump every few days, and a
// show page reads its episodes live, but every list on the site (latest, a
// category, search) sorts by podcasts.newest_pubdate, which is only as fresh as
// the dump. This reads each show's feed on its own rhythm, with the house cadence
// (@profullstack/scraper-daemon/cadence): fifteen minutes for a show posting
// hourly, every few hours around a weekly show's release day, up to a week for a
// quiet one, and a show silent six months is archived (read once a quarter).
//
// State lives in feed_state, keyed by feed URL, because the loader rebuilds the
// podcasts table wholesale on every dump; applyToPodcasts() puts what the crawler
// learned back onto the new rows.
//
// Every function takes `q(text, params)`: Postgres with $n placeholders (Bun SQL's
// unsafe() in the daemon), so this file has no driver of its own.
import { tierSql } from "@profullstack/scraper-daemon/cadence";
import { closeTruncatedFeed, MAX_FEED_BYTES, readCappedText } from "./feed-body";
import { parseFeed, type Episode } from "./feed";

export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export type FeedRow = {
  key: string;
  url: string;
  minutes: number;
  fails: number;
  etag: string | null;
  last_modified: string | null;
  dates: number[];
};

const UA = "p0dcasters/1.0 (+https://p0dcasters.com)";
const TIER = tierSql("minutes");
/** The last this-many publish dates are kept, so a 304 can still be scheduled on rhythm. */
const KEEP_DATES = 30;

export const FEED_STATE_DDL = [
  `CREATE TABLE IF NOT EXISTS feed_state(
    feed_url text PRIMARY KEY,
    minutes integer NOT NULL DEFAULT 60,
    next_at timestamptz NOT NULL DEFAULT now(),
    fails integer NOT NULL DEFAULT 0,
    last_error text,
    etag text,
    last_modified text,
    checked_at timestamptz,
    ok_at timestamptz,
    dates jsonb NOT NULL DEFAULT '[]',
    newest_pubdate bigint,
    episode_count integer,
    latest_audio text,
    latest_duration integer
  )`,
  // Must stay exactly tierSql("minutes"): dueFeeds filters on that expression.
  `CREATE INDEX IF NOT EXISTS feed_state_due_tier ON feed_state((${TIER}), next_at)`,
];

export async function ensureFeedState(q: Query): Promise<void> {
  for (const s of FEED_STATE_DDL) await q(s);
}

/**
 * Give every listed show a row, and drop rows for shows no longer listed.
 *
 * A new show starts on a guess from what the dump knows (per_week and the newest
 * episode) and is spread over the next six hours, so a reload of 300k new rows is
 * not 300k reads in one minute; the first real read replaces the guess.
 */
export async function seedFeedState(q: Query): Promise<{ added: number; dropped: number }> {
  const added = await q(
    `INSERT INTO feed_state(feed_url, minutes, next_at, newest_pubdate)
     SELECT p.feed_url, s.minutes,
            now() + random() * least(s.minutes, 360) * interval '1 minute',
            p.newest_pubdate
     FROM podcasts p
     CROSS JOIN LATERAL (SELECT CASE
       WHEN p.newest_pubdate < extract(epoch FROM now() - interval '180 days') THEN 129600
       WHEN coalesce(p.per_week, 0) <= 0 THEN 1440
       ELSE least(10079, greatest(15, round(10080 / p.per_week / 4)))::int
     END AS minutes) s
     ON CONFLICT (feed_url) DO NOTHING
     RETURNING 1`,
  );
  const dropped = await q(
    `DELETE FROM feed_state s WHERE NOT EXISTS (SELECT 1 FROM podcasts p WHERE p.feed_url = s.feed_url) RETURNING 1`,
  );
  return { added: added.length, dropped: dropped.length };
}

/** Due shows of one tier (0 hot .. 4 archived), oldest due first. */
export async function dueFeeds(q: Query, tierIndex: number, limit: number): Promise<FeedRow[]> {
  const rows = await q(
    `SELECT feed_url, minutes, fails, etag, last_modified, dates
     FROM feed_state WHERE ${TIER} = $1 AND next_at <= now()
     ORDER BY next_at LIMIT $2`,
    [tierIndex, limit],
  );
  return rows.map((r) => ({
    key: String(r.feed_url),
    url: String(r.feed_url),
    minutes: Number(r.minutes),
    fails: Number(r.fails ?? 0),
    etag: (r.etag as string | null) ?? null,
    last_modified: (r.last_modified as string | null) ?? null,
    dates: Array.isArray(r.dates) ? (r.dates as number[]) : typeof r.dates === "string" ? (JSON.parse(r.dates) as number[]) : [],
  }));
}

export type CrawlResult = {
  notModified: boolean;
  episodes: Episode[];
  dates: number[];
  etag: string | null;
  lastModified: string | null;
};

/** One conditional read of a feed. Throws on anything but 200/304, so the daemon's error ladder applies. */
export async function readFeed(feed: FeedRow, signal?: AbortSignal): Promise<CrawlResult> {
  const headers: Record<string, string> = { "user-agent": UA, accept: "application/rss+xml, application/xml, */*" };
  if (feed.etag) headers["if-none-match"] = feed.etag;
  if (feed.last_modified) headers["if-modified-since"] = feed.last_modified;
  const timeout = AbortSignal.timeout(20_000);
  const res = await fetch(feed.url, { headers, signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: "follow" });
  if (res.status === 304) {
    res.body?.cancel().catch(() => {});
    return { notModified: true, episodes: [], dates: feed.dates.map((s) => s * 1000), etag: feed.etag, lastModified: feed.last_modified };
  }
  if (res.status === 429 || res.status === 503) {
    res.body?.cancel().catch(() => {});
    const after = Number(res.headers.get("retry-after"));
    throw Object.assign(new Error(`HTTP ${res.status}`), { retryAfterMs: Number.isFinite(after) && after > 0 ? after * 1000 : 30 * 60_000 });
  }
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    throw new Error(`HTTP ${res.status}`);
  }
  const body = await readCappedText(res, MAX_FEED_BYTES);
  const xml = body.truncated ? closeTruncatedFeed(body.text) : body.text;
  if (!xml) throw new Error(`feed over ${MAX_FEED_BYTES} bytes with no complete item`);
  const episodes = parseFeed(xml);
  return {
    notModified: false,
    episodes,
    dates: episodes.filter((e) => e.pubdate > 0).map((e) => e.pubdate * 1000),
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}

/** The newest dated episode, which is what the directory sorts by. */
export function newestEpisode(episodes: Episode[]): Episode | null {
  let best: Episode | null = null;
  for (const e of episodes) if (e.pubdate > 0 && (!best || e.pubdate > best.pubdate)) best = e;
  return best;
}

/** Write the next read and what was learned, to feed_state and to the live podcasts row. */
export async function saveCrawl(
  q: Query,
  feed: FeedRow,
  plan: { minutes: number; nextAt: number },
  result: CrawlResult,
): Promise<void> {
  const newest = newestEpisode(result.episodes);
  const dates = [...new Set(result.dates.map((t) => Math.floor(t / 1000)))].sort((a, b) => b - a).slice(0, KEEP_DATES);
  await q(
    `UPDATE feed_state SET minutes = $1, next_at = to_timestamp($2), fails = 0, last_error = NULL,
       etag = $3, last_modified = $4, checked_at = now(), ok_at = now(), dates = $5::text::jsonb,
       newest_pubdate = coalesce($6, newest_pubdate),
       episode_count = coalesce($7, episode_count),
       latest_audio = coalesce($8, latest_audio),
       latest_duration = coalesce($9, latest_duration)
     WHERE feed_url = $10`,
    [
      plan.minutes,
      plan.nextAt / 1000,
      result.etag,
      result.lastModified,
      JSON.stringify(dates),
      newest?.pubdate ?? null,
      result.notModified ? null : result.episodes.length,
      newest?.source ?? null,
      newest?.duration ?? null,
      feed.url,
    ],
  );
  if (newest) {
    // Only ever forward: a feed that trimmed its archive must not make a show look older.
    await q(
      `UPDATE podcasts SET newest_pubdate = $1, latest_audio = $2, latest_duration = coalesce($3, latest_duration),
         episode_count = greatest(episode_count, $4)
       WHERE feed_url = $5 AND newest_pubdate < $6`,
      [newest.pubdate, newest.source, newest.duration, result.episodes.length, feed.url, newest.pubdate],
    );
  }
}

export async function saveFailure(
  q: Query,
  feed: FeedRow,
  f: { error: string; held: boolean; fails: number | null; nextAt: number; retire: boolean },
): Promise<void> {
  await q(
    `UPDATE feed_state SET next_at = to_timestamp($1), checked_at = now(), last_error = $2,
       fails = CASE WHEN $3 THEN fails ELSE fails + 1 END,
       minutes = CASE WHEN $4 THEN 129600 ELSE minutes END
     WHERE feed_url = $5`,
    [f.nextAt / 1000, f.error.slice(0, 500), f.held, f.retire, feed.url],
  );
}

/** After a reload swapped in fresh podcasts rows: re-apply anything newer the crawler already saw. */
export async function applyToPodcasts(q: Query): Promise<number> {
  const rows = await q(
    `UPDATE podcasts p SET newest_pubdate = s.newest_pubdate,
       latest_audio = coalesce(s.latest_audio, p.latest_audio),
       latest_duration = coalesce(s.latest_duration, p.latest_duration),
       episode_count = greatest(p.episode_count, coalesce(s.episode_count, 0))
     FROM feed_state s
     WHERE s.feed_url = p.feed_url AND s.newest_pubdate > p.newest_pubdate
     RETURNING 1`,
  );
  return rows.length;
}
