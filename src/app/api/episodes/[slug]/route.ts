import { one } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import { fetchEpisodes } from "@/lib/feed";

export const revalidate = 1800;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const show = await one<Podcast>(
    "SELECT slug, title, feed_url, image_url FROM podcasts WHERE slug = ?",
    [slug],
  );
  if (!show) return Response.json({ error: "not found" }, { status: 404 });

  const episodes = await fetchEpisodes(show.feed_url);
  return Response.json(
    {
      slug: show.slug,
      title: show.title,
      image: show.image_url,
      episodes,
    },
    { headers: { "cache-control": "public, s-maxage=1800, stale-while-revalidate=86400" } },
  );
}
