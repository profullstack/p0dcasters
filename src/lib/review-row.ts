import type { SubmissionRow } from "@/lib/submit";

/** A submission as the review API shows it: the row, the show it would become, and who did what. */
export function publicRow(r: SubmissionRow) {
  let show: unknown = null;
  try {
    show = r.podcast ? JSON.parse(r.podcast) : null;
  } catch {
    show = null;
  }
  return {
    id: r.id,
    status: r.status,
    input: r.input,
    feedUrl: r.feed_url,
    slug: r.slug,
    title: r.title,
    page: r.slug ? `https://p0dcasters.com/podcast/${r.slug}` : null,
    submittedBy: r.submitted_by ?? null,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    reviewedAt: r.reviewed_at ?? null,
    reviewedBy: r.reviewed_by ?? null,
    reason: r.reason ?? null,
    error: r.error,
    message: r.message,
    show,
  };
}
