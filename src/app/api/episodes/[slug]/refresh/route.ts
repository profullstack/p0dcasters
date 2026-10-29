import { revalidatePath } from "next/cache";
import { db, one } from "@/lib/db";
import { episodeCache, fetchEpisodes } from "@/lib/feed";

export const dynamic = "force-dynamic";

/** A show read this recently by a refresh is answered from what we have. */
const RECENT_MS = 2 * 60_000;
const lastRefresh = new Map<string, number>();

/**
 * Read a show's feed now: the Refresh button on a show page.
 *
 * The page's episodes come straight from the feed, so dropping the cached copy
 * and reading it again is the whole refresh as far as the reader can see. The
 * show is also moved to the front of the crawler's queue (feed_state), so the
 * directory row every list sorts by is rewritten by the daemon within seconds.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const show = await one<{ slug: string; feed_url: string }>("SELECT slug, feed_url FROM podcasts WHERE slug = ?", [slug]);
  if (!show) return Response.json({ error: "not found" }, { status: 404 });

  const last = lastRefresh.get(show.feed_url) ?? 0;
  if (Date.now() - last < RECENT_MS) {
    return Response.json({ ok: true, state: "recent" }, { headers: { "cache-control": "no-store" } });
  }
  lastRefresh.set(show.feed_url, Date.now());
  if (lastRefresh.size > 5000) lastRefresh.clear();

  const before = episodeCache.get(show.feed_url);
  episodeCache.delete(show.feed_url);
  const episodes = await fetchEpisodes(show.feed_url);
  const newest = (list: { pubdate: number }[] | undefined) => (list ?? []).reduce((m, e) => Math.max(m, e.pubdate), 0);
  const fresh = before ? episodes.filter((e) => e.pubdate > newest(before)).length : null;

  try {
    await db().execute({ sql: "UPDATE feed_state SET next_at = '1970-01-01T00:00:00Z' WHERE feed_url = ?", args: [show.feed_url] });
  } catch {
    // No crawler state yet (first deploy): the page is still current.
  }
  revalidatePath(`/podcast/${show.slug}`);

  return Response.json(
    { ok: episodes.length > 0, state: episodes.length ? "read" : "failed", episodes: episodes.length, newEpisodes: fresh, newest: newest(episodes) || null },
    { headers: { "cache-control": "no-store" } },
  );
}
