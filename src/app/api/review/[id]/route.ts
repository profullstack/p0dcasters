import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { bearerPrincipal, SCOPE_REVIEW } from "@/lib/openaccess";
import { reviewerOf } from "@/lib/review";
import { decideSubmission, submissionRow } from "@/lib/submit";
import { publicRow } from "@/lib/review-row";

export const dynamic = "force-dynamic";

const headers = { "cache-control": "private, no-store" };

async function reviewer(req: Request): Promise<string | null> {
  const [user, principal] = await Promise.all([currentUser(), bearerPrincipal(req)]);
  return reviewerOf(user, principal);
}

const unauthorized = () =>
  Response.json(
    { ok: false, error: `sign in as an admin, or present an OpenAccess token with scope ${SCOPE_REVIEW}` },
    { status: 401, headers },
  );

/** GET /api/review/{id} — one submission with the show as read from its feed. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await reviewer(req))) return unauthorized();
  const row = await submissionRow((await ctx.params).id);
  if (!row) return Response.json({ ok: false, error: "no such submission" }, { status: 404, headers });
  return Response.json({ ok: true, submission: publicRow(row) }, { headers });
}

/** POST /api/review/{id} { decision: "approve" | "reject", reason? } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const by = await reviewer(req);
  if (!by) return unauthorized();
  const { id } = await ctx.params;

  let body: { decision?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad request" }, { status: 400, headers });
  }
  const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : null;
  if (!decision) return Response.json({ ok: false, error: "decision must be approve or reject" }, { status: 400, headers });
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) || null : null;

  const out = await decideSubmission(id, decision, by, reason);
  if (!out.ok) return Response.json(out, { status: out.status, headers });
  if (out.slug) {
    // A visit to the slug before approval cached a 404 for the show page's
    // revalidate window, and the front page counts are cached too.
    try {
      revalidatePath(`/podcast/${out.slug}`);
      revalidatePath("/");
    } catch {
      /* nothing to revalidate outside a request scope */
    }
  }
  return Response.json(
    { ok: true, id, status: out.status, slug: out.slug, title: out.title, page: out.slug ? `https://p0dcasters.com/podcast/${out.slug}` : null },
    { headers },
  );
}
