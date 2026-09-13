import { after } from "next/server";
import { parseSubmission, submitReply, wantsHtml } from "@profullstack/submit-feed";
import type { AcceptedFeed, RejectedFeed } from "@profullstack/submit-feed";
import { currentUser, origin } from "@/lib/auth/session";
import { bearerPrincipal, SCOPE_SUBMIT } from "@/lib/openaccess";
import {
  MAX_URLS,
  RATE_LIMIT,
  INLINE_WAIT_MS,
  clientIp,
  createBatch,
  drainBatch,
  hashIp,
  requestsThisHour,
  resolveSubmission,
} from "@/lib/submit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Add a show. Speaks the contract in @profullstack/submit-feed, so the same
 * request works here, on rssamplifier.com, from the CLI and from the MCP tool:
 *
 *   JSON  { url } | { urls: [] } | { opml }      form  input=… | opml=<file>
 *   200   { ok, accepted, rejected, queued, total, submissionId, statusUrl }
 *   303   for a browser: to the show, or to the status page
 *
 * One URL resolves in the request, so the person who typed it sees at once
 * whether the feed can be listed; a list is recorded and resolved after the
 * response, one feed at a time, and the status page shows each land. A feed
 * that passes waits for a reviewer (it comes back as `queued`, with the
 * status page to watch), so only a show already here lands in `accepted`.
 * No account is needed; the budget is twenty requests an hour per address.
 * A signed-in listener, or an OpenAccess principal holding podcasts:submit,
 * is remembered on the row as the submitter, which the reviewer sees.
 */
export async function POST(req: Request) {
  const html = wantsHtml(req.headers.get("accept"));
  const site = await origin();
  const back = (code: string, url = "") =>
    Response.redirect(`${site}/submit?error=${encodeURIComponent(code)}${url ? `&url=${encodeURIComponent(url)}` : ""}`, 303);

  const type = req.headers.get("content-type") ?? "";
  let body: unknown;
  try {
    body = type.includes("application/json") ? await req.json() : await req.formData();
  } catch {
    return html ? back("bad-request") : Response.json(submitReply({ error: "bad-request", ok: false }), { status: 400 });
  }

  const s = await parseSubmission(body, { maxEntries: MAX_URLS });
  if (s.empty || s.urls.length === 0) {
    const code = s.kind === "opml" ? "no-feeds-in-opml" : s.invalid.length ? "invalid-url" : "bad-request";
    return html
      ? back(code, s.invalid[0] ?? "")
      : Response.json(
          submitReply({ ok: false, error: code, rejected: s.invalid.map((url) => ({ url, error: "invalid-url" })) }),
          { status: 400 },
        );
  }

  const ipHash = hashIp(clientIp(req));
  if ((await requestsThisHour(ipHash)) >= RATE_LIMIT) {
    return html
      ? back("rate-limited")
      : Response.json(submitReply({ ok: false, error: "rate-limited", retryAfterSeconds: 3600 }), {
          status: 429,
          headers: { "retry-after": "3600" },
        });
  }

  const [user, principal] = await Promise.all([currentUser(), bearerPrincipal(req)]);
  const submittedBy = user?.email ?? (principal?.scopes.includes(SCOPE_SUBMIT) ? principal.sub : null);
  const { batchId, ids } = await createBatch(s.urls, { userId: user?.id ?? null, ipHash, submittedBy });
  const statusUrl = `${site}/submissions/${batchId}`;
  const rejected: RejectedFeed[] = s.invalid.map((url) => ({ url, error: "invalid-url" }));
  const accepted: AcceptedFeed[] = [];

  if (s.urls.length === 1) {
    // Inline, bounded. Past the bound the status page answers and the same
    // promise finishes in the background, so nothing is resolved twice.
    const work = resolveSubmission(ids[0]);
    const outcome = await Promise.race([
      work,
      new Promise<"slow">((r) => setTimeout(() => r("slow"), INLINE_WAIT_MS)),
    ]);
    if (outcome === "slow") {
      after(async () => { await work; });
      return html ? Response.redirect(statusUrl, 303) : Response.json(submitReply({ queued: 1, submissionId: batchId, statusUrl }));
    }
    if (outcome && outcome.status === "review") {
      // Read, checked, waiting for a person. The status page says so.
      return html
        ? Response.redirect(statusUrl, 303)
        : Response.json({
            ...submitReply({ accepted, rejected, queued: 1, submissionId: batchId, statusUrl }),
            review: [{ url: s.urls[0], feedUrl: outcome.feedUrl, title: outcome.title }],
          });
    }
    if (outcome && outcome.status !== "rejected") {
      const page = `${site}/podcast/${outcome.slug}`;
      accepted.push({ url: s.urls[0], slug: outcome.slug, page, existing: outcome.status === "existing", feedUrl: outcome.feedUrl, title: outcome.title });
      return html ? Response.redirect(page, 303) : Response.json(submitReply({ accepted, rejected, submissionId: batchId, statusUrl }));
    }
    if (outcome) rejected.unshift({ url: s.urls[0], error: outcome.error, message: outcome.message });
    return html
      ? back(outcome?.error ?? "fetch-failed", s.urls[0])
      : Response.json(submitReply({ accepted, rejected, submissionId: batchId, statusUrl }));
  }

  after(async () => { await drainBatch(batchId); });
  return html
    ? Response.redirect(statusUrl, 303)
    : Response.json(submitReply({ accepted, rejected, queued: s.urls.length, submissionId: batchId, statusUrl }));
}
