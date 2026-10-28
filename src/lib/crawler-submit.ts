import { timingSafeEqual } from "node:crypto";

/**
 * Submissions that come from our own crawlers rather than from a person.
 *
 * The review queue (src/lib/review.ts) exists so a stranger cannot list a show
 * without someone looking at it. A feed our own pipeline found (a bulk import
 * of a publisher list, a discovery crawl) has already been chosen by us, so it
 * should be listed as soon as it passes the directory's rules, with no admin
 * email. Anthony, 2026-10-28: "auto approve this unless it's a manual
 * submission not our crawler".
 *
 * A crawler proves it is ours with a shared secret in the `x-crawler-token`
 * header. CRAWLER_TOKENS holds one `name:token` pair per crawler, comma
 * separated; the name is recorded as the submission's source
 * (`submitted_by = crawler:<name>`), which is what resolveSubmission keys
 * auto-approval on, so a batch drained later (after a restart) is still
 * approved. A user agent alone proves nothing and earns nothing here.
 *
 * Pure apart from node:crypto, so a test can import it.
 */

export const CRAWLER_PREFIX = "crawler:";
export const CRAWLER_HEADER = "x-crawler-token";

/** `name:token,name2:token2` -> [[name, token], ...]; malformed pairs are dropped. */
export function parseCrawlerTokens(raw: string | null | undefined): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const part of (raw ?? "").split(",")) {
    const i = part.indexOf(":");
    if (i <= 0) continue;
    const name = part.slice(0, i).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    const token = part.slice(i + 1).trim();
    if (name && token.length >= 16) out.push([name, token]);
  }
  return out;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The crawler's source label (`crawler:<name>`) when the token matches one, else null. */
export function crawlerSource(token: string | null | undefined, raw: string | null | undefined): string | null {
  const t = (token ?? "").trim();
  if (!t) return null;
  for (const [name, secret] of parseCrawlerTokens(raw)) {
    if (same(t, secret)) return `${CRAWLER_PREFIX}${name}`;
  }
  return null;
}

/** True when a submission row's source is one of our crawlers. */
export function isCrawlerSource(submittedBy: string | null | undefined): boolean {
  return Boolean(submittedBy && submittedBy.startsWith(CRAWLER_PREFIX) && submittedBy.length > CRAWLER_PREFIX.length);
}
