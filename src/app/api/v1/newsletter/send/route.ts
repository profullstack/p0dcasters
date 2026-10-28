import { currentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/review";
import { runWeeklyNewsletter } from "@/lib/newsletter";
import { webSender } from "@/lib/newsletter-store";

export const dynamic = "force-dynamic";

/**
 * Run one pass of the weekly send from here, by hand. Admins only
 * (ADMIN_EMAILS). A dry run unless the body says { "dry_run": false }: it
 * returns how many accounts are owed this week's issue and the issue itself,
 * and sends and writes nothing. A real pass obeys the same rules as the
 * daemon's: nothing before the slot, one mail per account per week,
 * NEWSLETTER_SEND=0 stops it, at most `limit` (default 50 here) mails.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  if (!isAdmin(user)) return Response.json({ error: "admins only" }, { status: 403 });
  const body = ((await req.json().catch(() => null)) ?? {}) as { dry_run?: unknown; limit?: unknown };
  const dryRun = body.dry_run !== false;
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
  const result = await runWeeklyNewsletter(webSender(), { dryRun, limit });
  return Response.json({ dry_run: dryRun, ...result }, { headers: { "cache-control": "no-store" } });
}
