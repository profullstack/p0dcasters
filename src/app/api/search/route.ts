import { searchShows, summary } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Search as JSON, for the CLI and for scripts. `q` and an optional `limit` (max 100). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") || "").trim();
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit")) || 30, 1), 100);
  if (!q) return Response.json({ error: "q is required" }, { status: 400 });
  const rows = await searchShows(q, limit);
  return Response.json(
    { query: q, shows: rows.map((p) => summary(p)) },
    { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
