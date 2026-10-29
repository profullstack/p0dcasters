import { decideSubmission, submissionsByStatus } from "@/lib/submit";

/**
 * Accept every submission waiting for review at once (or only `ids`), for the
 * Accept all button, POST /api/review and the MCP tool. Each one goes through
 * the same decision as a single approve, so a feed that is already listed
 * comes back as `existing` and a failure on one does not stop the rest.
 */
export type AcceptResult = { id: string; ok: boolean; status?: string; slug?: string | null; title?: string | null; error?: string };

export async function acceptSubmissions(by: string, opts: { ids?: string[]; reason?: string | null } = {}) {
  const ids = opts.ids ?? (await submissionsByStatus("review")).map((r) => r.id);
  const results: AcceptResult[] = [];
  for (const id of ids) {
    try {
      const out = await decideSubmission(id, "approve", by, opts.reason ?? null);
      results.push(out.ok ? { id, ok: true, status: out.status, slug: out.slug, title: out.title } : { id, ok: false, error: out.error });
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const listed = results.filter((r) => r.ok && r.status === "listed").length;
  const existing = results.filter((r) => r.ok && r.status === "existing").length;
  const failed = results.filter((r) => !r.ok).length;
  return { ok: failed === 0, listed, existing, failed, results };
}
