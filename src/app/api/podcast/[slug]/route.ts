import { showBySlug, summary } from "@/lib/queries";

export const revalidate = 3600;

/** One show as JSON: what the page shows, without the episodes (see /api/episodes/<slug>). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await showBySlug(slug);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(summary(p, true), {
    headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
