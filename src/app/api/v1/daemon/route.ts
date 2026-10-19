import { db } from "@/lib/db";

/**
 * What the directory daemon (scripts/daemon.mjs, @profullstack/scraper-daemon)
 * is doing: its tasks, last successes and failures, pipeline progress and the
 * last 20 runs. The daemon runs on the host, not in this container, so it
 * writes `status()` into `scraper_daemon_state` every minute and this route
 * serves the last copy; `updatedAt` says how old it is.
 *
 * Uncached for the same reason /api/crawlstats is.
 */
export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store" };

export async function GET() {
  try {
    const rs = await db().execute({
      sql: "SELECT value FROM scraper_daemon_state WHERE key = ?",
      args: ["status"],
    });
    const raw = rs.rows[0]?.value as unknown;
    if (raw == null) {
      return Response.json({ error: "the daemon has not reported yet" }, { status: 503, headers: HEADERS });
    }
    const status = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Response.json(status, { headers: HEADERS });
  } catch {
    return Response.json({ error: "daemon status unavailable" }, { status: 503, headers: HEADERS });
  }
}
