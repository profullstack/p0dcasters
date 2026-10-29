import { currentUser } from "@/lib/auth/session";
import { bearerPrincipal, SCOPE_REVIEW } from "@/lib/openaccess";
import { reviewerOf } from "@/lib/review";
import { revalidatePath } from "next/cache";
import { submissionsByStatus, type SubmissionRow } from "@/lib/submit";
import { acceptSubmissions } from "@/lib/accept-all";
import { publicRow } from "@/lib/review-row";

export const dynamic = "force-dynamic";

const headers = { "cache-control": "private, no-store" };

/**
 * GET /api/review?status=review — the queue, for reviewers: an admin session,
 * or an OpenAccess bearer token whose grant carries submissions:review.
 */
export async function GET(req: Request) {
  const [user, principal] = await Promise.all([currentUser(), bearerPrincipal(req)]);
  if (!reviewerOf(user, principal)) {
    return Response.json(
      { ok: false, error: `sign in as an admin, or present an OpenAccess token with scope ${SCOPE_REVIEW}` },
      { status: 401, headers },
    );
  }
  const status = new URL(req.url).searchParams.get("status") || "review";
  if (!["review", "listed", "existing", "rejected", "pending", "resolving"].includes(status)) {
    return Response.json({ ok: false, error: "unknown status" }, { status: 400, headers });
  }
  const rows = await submissionsByStatus(status as SubmissionRow["status"]);
  return Response.json({ ok: true, status, submissions: rows.map(publicRow) }, { headers });
}

/**
 * POST /api/review { decision: "approve", ids?: string[], reason? } — accept
 * every submission waiting for review at once (or only `ids`). Each one goes
 * through the same decision as a single approve, so a feed that is already
 * listed comes back as `existing` and a failure on one does not stop the rest.
 */
export async function POST(req: Request) {
  const [user, principal] = await Promise.all([currentUser(), bearerPrincipal(req)]);
  const by = reviewerOf(user, principal);
  if (!by) {
    return Response.json(
      { ok: false, error: `sign in as an admin, or present an OpenAccess token with scope ${SCOPE_REVIEW}` },
      { status: 401, headers },
    );
  }
  let body: { decision?: unknown; ids?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad request" }, { status: 400, headers });
  }
  if (body.decision !== "approve") {
    return Response.json({ ok: false, error: 'decision must be "approve" (reject one at a time)' }, { status: 400, headers });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) || null : null;
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : undefined;
  const out = await acceptSubmissions(by, { ids, reason });
  const { listed, results } = out;
  if (listed) {
    try {
      for (const r of results) if (r.slug) revalidatePath(`/podcast/${r.slug}`);
      revalidatePath("/");
    } catch {
      /* nothing to revalidate outside a request scope */
    }
  }
  return Response.json(out, { headers });
}
