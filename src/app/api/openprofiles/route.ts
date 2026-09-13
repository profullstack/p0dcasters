import { listProfiles } from "@/lib/openprofile/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/openprofiles?since=&limit=&cursor=
 *
 * Every public podcaster profile, most recently changed first, for a
 * directory that pulls (nichedb.dev reads this into its People collection).
 * `since` is an ISO time; `limit` up to 500; `next` is the cursor for the
 * page after. Keyless. Each entry names the profile file, the profile page
 * and the show page, with the accounts the profile lists, so a reader can
 * de-duplicate before fetching the file.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const out = await listProfiles({ since: q.get("since"), limit: Number(q.get("limit")) || 100, cursor: q.get("cursor") });
  return Response.json(out, {
    headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600", "access-control-allow-origin": "*" },
  });
}
