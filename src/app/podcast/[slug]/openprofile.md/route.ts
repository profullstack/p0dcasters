import { MEDIA_TYPE } from "@profullstack/openprofile";
import { showBySlug } from "@/lib/queries";
import { renderShowProfile } from "@/lib/openprofile/store";
import { profileUrl } from "@/lib/openprofile/generate";

export const revalidate = 3600;

/**
 * The podcaster's OpenProfile.md (logicsrc.com/openprofile), generated from
 * the feed they publish, enriched with what rssamplifier knows about the same
 * person, corrected by the person when they have claimed it. A directory
 * reads this instead of scraping the show page.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await showBySlug(slug);
  if (!p) return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain" } });
  const r = await renderShowProfile(p);
  if (!r.public) return new Response("this profile is private\n", { status: 404, headers: { "content-type": "text/plain" } });
  return new Response(r.markdown, {
    headers: {
      "content-type": MEDIA_TYPE,
      "content-disposition": `inline; filename="${p.slug}.openprofile.md"`,
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
      link: `<${profileUrl(p.slug)}>; rel="openprofile"`,
      "last-modified": new Date(r.updatedAt * 1000).toUTCString(),
    },
  });
}
