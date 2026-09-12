import { one } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import { fetchEpisodes } from "@/lib/feed";
import { toM3U } from "@/lib/playlist";

export const revalidate = 1800;

/**
 * The whole show as one playlist file, for a player that takes a URL.
 *
 * Paste it into nixamp's link box and the show goes live, every episode in
 * order; any player that opens an M3U over HTTP plays it the same way.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const show = await one<Podcast>(
    "SELECT slug, title, feed_url FROM podcasts WHERE slug = ?",
    [slug],
  );
  if (!show) return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain" } });

  const episodes = await fetchEpisodes(show.feed_url);
  return new Response(toM3U(show.title, show.slug, episodes), {
    headers: {
      "content-type": "audio/x-mpegurl; charset=utf-8",
      "content-disposition": `inline; filename="${show.slug}.m3u"`,
      "cache-control": "public, s-maxage=1800, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
    },
  });
}
