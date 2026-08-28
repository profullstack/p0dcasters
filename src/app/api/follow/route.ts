import { db, one, args } from "@/lib/db";
import { currentUser } from "@/lib/auth/session";
import { now } from "@/lib/auth/crypto";

export const dynamic = "force-dynamic";

/** Whether the caller follows one show. The show page itself is static. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") || "";
  const user = await currentUser();
  const headers = { "cache-control": "private, no-store" };
  if (!user || !slug) return Response.json({ signedIn: false, following: false }, { headers });
  const row = await one<{ slug: string }>(
    "SELECT slug FROM follows WHERE user_id = ? AND slug = ?",
    [user.id, slug],
  );
  return Response.json({ signedIn: true, following: Boolean(row) }, { headers });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in first" }, { status: 401 });

  let body: { slug?: string; following?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!slug) return Response.json({ error: "bad request" }, { status: 400 });

  // Follows are keyed by slug rather than podcasts.id because the weekly
  // directory rebuild reassigns ids. Checking the show exists keeps the table
  // from filling with slugs that never did.
  const show = await one<{ slug: string }>("SELECT slug FROM podcasts WHERE slug = ?", [
    slug,
  ]);
  if (!show) return Response.json({ error: "no such show" }, { status: 404 });

  if (body.following === false) {
    await db().execute({
      sql: "DELETE FROM follows WHERE user_id = ? AND slug = ?",
      args: args([user.id, slug]),
    });
    return Response.json({ ok: true, following: false });
  }

  await db().execute({
    sql: "INSERT OR IGNORE INTO follows(user_id, slug, created_at) VALUES(?,?,?)",
    args: args([user.id, slug, now()]),
  });
  return Response.json({ ok: true, following: true });
}
