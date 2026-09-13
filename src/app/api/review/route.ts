import { currentUser } from "@/lib/auth/session";
import { bearerPrincipal, SCOPE_REVIEW } from "@/lib/openaccess";
import { reviewerOf } from "@/lib/review";
import { submissionsByStatus, type SubmissionRow } from "@/lib/submit";
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
