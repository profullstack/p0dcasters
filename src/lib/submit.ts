import { resolveFeed, hostOf, uniqueSlug, explainError, submitFeed } from "@profullstack/submit-feed";
import type { ParsedFeed } from "@profullstack/submit-feed";
import { all, one, db, args } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import { env, now, secret, sha256, token } from "@/lib/auth/crypto";
import { normalizeLang } from "@/lib/format";
import { isPlatformHost } from "@/lib/platforms";
import { notifyReviewers } from "@/lib/review";

/**
 * Feed submission, the site-specific half.
 *
 * @profullstack/submit-feed turns what a person typed into a parsed feed and
 * says how the endpoint should answer. Everything here is what the package
 * deliberately leaves to the site: whether the feed qualifies for THIS
 * directory, the row it becomes, the slug it gets, and the ledger that
 * remembers it across a rebuild.
 *
 * A submission is read and checked at once, against the same rules the
 * rebuild applies to the Podcast Index dump, but it is listed only after a
 * person has looked at it (src/lib/review.ts). The row it would become is
 * kept as JSON on the `submissions` row in status `review`; approving inserts
 * it into `podcasts` and its FTS index and moves the row to `listed`, which
 * is the status scripts/load_turso.mjs puts back after the weekly reload.
 * A feed that fails a rule is refused on the spot with the rule named, so the
 * queue holds only shows that could be listed.
 */

export const MAX_URLS = 50;
/** Requests per address per hour. Matches rssamplifier's form. */
export const RATE_LIMIT = 20;
/** How long the request waits for one feed before handing over to the status page. */
export const INLINE_WAIT_MS = 25_000;
/** The directory's own recency rule: a show is dropped past this. */
export const CUTOFF_DAYS = 90;
/** A row this old in `resolving` was abandoned by a crashed process. */
const STALE_SECONDS = 180;
const USER_AGENT = "p0dcasters/1.0 (+https://p0dcasters.com/submit; podcast directory)";

export type SubmissionRow = {
  id: string;
  batch_id: string;
  input: string;
  feed_url: string | null;
  slug: string | null;
  title: string | null;
  status: "pending" | "resolving" | "review" | "listed" | "existing" | "rejected";
  error: string | null;
  message: string | null;
  created_at: number;
  resolved_at: number | null;
  podcast?: string | null;
  submitted_by?: string | null;
  reviewed_at?: number | null;
  reviewed_by?: string | null;
  reason?: string | null;
};

export type Outcome =
  | { status: "listed" | "existing"; slug: string; title: string; feedUrl: string }
  | { status: "review"; title: string; feedUrl: string; row: Omit<Podcast, "id" | "slug"> }
  | { status: "rejected"; error: string; message: string };

// The review columns were added after the table (PR #21 listed on the spot).
// Adding them lazily means a deploy never depends on running the migration
// first; scripts/migrate_submissions.mjs adds the same ones for a fresh db.
let columnsReady: Promise<void> | null = null;
export function ensureReviewColumns(): Promise<void> {
  if (!columnsReady) {
    columnsReady = (async () => {
      for (const col of ["submitted_by TEXT", "reviewed_at INTEGER", "reviewed_by TEXT", "reason TEXT"]) {
        try {
          await db().execute(`ALTER TABLE submissions ADD COLUMN ${col}`);
        } catch {
          /* already there */
        }
      }
    })();
  }
  return columnsReady;
}

/** Hash an address with the site secret, so the ledger never holds an IP. */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return sha256(`${ip}|${secret()}`).slice(0, 32);
}

/** The client address: the LAST hop of x-forwarded-for is the one Railway appended. */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.headers.get("x-real-ip") || null;
}

/** Requests from this address in the last hour. */
export async function requestsThisHour(ipHash: string | null): Promise<number> {
  if (!ipHash) return 0;
  const row = await one<{ n: number }>(
    "SELECT COUNT(DISTINCT batch_id) AS n FROM submissions WHERE ip_hash = ? AND created_at > ?",
    [ipHash, now() - 3600],
  );
  return Number(row?.n ?? 0);
}

/** Record a batch of inputs as pending rows. */
export async function createBatch(
  inputs: string[],
  ctx: { userId: number | null; ipHash: string | null; submittedBy?: string | null },
): Promise<{ batchId: string; ids: string[] }> {
  await ensureReviewColumns();
  const batchId = token(9);
  const ids = inputs.map(() => token(9));
  const t = now();
  await db().batch(
    inputs.map((input, i) => ({
      sql: `INSERT INTO submissions(id, batch_id, input, status, user_id, ip_hash, created_at, submitted_by)
            VALUES(?,?,?,'pending',?,?,?,?)`,
      args: args([ids[i], batchId, input, ctx.userId, ctx.ipHash, t, ctx.submittedBy ?? null]),
    })),
    "write",
  );
  return { batchId, ids };
}

export async function batchRows(batchId: string): Promise<SubmissionRow[]> {
  return all<SubmissionRow>(
    `SELECT id, batch_id, input, feed_url, slug, title, status, error, message, created_at, resolved_at
     FROM submissions WHERE batch_id = ? ORDER BY created_at, rowid`,
    [batchId],
  );
}

/**
 * Resolve one pending row and record what became of it.
 *
 * Claims the row first (pending -> resolving) so two workers never resolve
 * the same submission; a row already claimed is left to whoever has it.
 */
export async function resolveSubmission(id: string): Promise<Outcome | null> {
  const claimed = await db().execute({
    sql: "UPDATE submissions SET status = 'resolving' WHERE id = ? AND status = 'pending'",
    args: [id],
  });
  if (!claimed.rowsAffected) return null;
  const row = await one<SubmissionRow>("SELECT * FROM submissions WHERE id = ?", [id]);
  if (!row) return null;

  let outcome: Outcome;
  try {
    outcome = await listFeed(row.input);
  } catch (err) {
    outcome = {
      status: "rejected",
      error: "fetch-failed",
      message: err instanceof Error ? err.message : "The feed could not be read.",
    };
  }

  // What the ledger keeps: for a show waiting on review, the row it would be
  // listed as (the reviewer sees the show, not a URL, and approval inserts
  // exactly this); for one already listed, the row as it stands.
  const podcast =
    outcome.status === "review"
      ? outcome.row
      : outcome.status === "listed"
        ? await one<Podcast>("SELECT * FROM podcasts WHERE slug = ?", [outcome.slug])
        : null;
  await db().execute({
    sql: `UPDATE submissions SET status = ?, feed_url = ?, slug = ?, title = ?, error = ?, message = ?, podcast = ?, resolved_at = ?
          WHERE id = ?`,
    args: args([
      outcome.status,
      outcome.status === "rejected" ? null : outcome.feedUrl,
      outcome.status === "rejected" || outcome.status === "review" ? null : outcome.slug,
      outcome.status === "rejected" ? null : outcome.title,
      outcome.status === "rejected" ? outcome.error : null,
      outcome.status === "rejected" ? outcome.message : null,
      podcast ? JSON.stringify(podcast) : null,
      now(),
      id,
    ]),
  });

  if (outcome.status === "listed") void forward(outcome.feedUrl);
  if (outcome.status === "review") {
    void notifyReviewers({
      title: outcome.title,
      host: outcome.row.host,
      episodes: outcome.row.episode_count,
      feedUrl: outcome.feedUrl,
      input: row.input,
      by: row.submitted_by ?? null,
    });
  }
  return outcome;
}

// --- the review queue --------------------------------------------------------

/** Rows in one status, newest first, for the queue and the API. */
export async function submissionsByStatus(status: SubmissionRow["status"], limit = 200): Promise<SubmissionRow[]> {
  await ensureReviewColumns();
  return all<SubmissionRow>(
    `SELECT * FROM submissions WHERE status = ? ORDER BY resolved_at DESC, created_at DESC LIMIT ?`,
    [status, limit],
  );
}

/** Rows a person has decided on, newest decision first. */
export async function recentDecisions(limit = 30): Promise<SubmissionRow[]> {
  await ensureReviewColumns();
  return all<SubmissionRow>(
    `SELECT * FROM submissions WHERE reviewed_at IS NOT NULL ORDER BY reviewed_at DESC LIMIT ?`,
    [limit],
  );
}

export async function submissionRow(id: string): Promise<SubmissionRow | null> {
  await ensureReviewColumns();
  return one<SubmissionRow>("SELECT * FROM submissions WHERE id = ?", [id]);
}

export type Decision =
  | { ok: true; status: "listed" | "existing" | "rejected"; slug: string | null; title: string | null }
  | { ok: false; error: string; status: number };

/**
 * Approve: the show is listed now, under a slug fixed from here on, from the
 * row read when it was submitted -- re-read first so the listing is as fresh
 * as the decision, falling back to that snapshot when the publisher is down.
 * Reject: the row records who said no and why, and the same feed can be
 * submitted again once whatever it was is fixed.
 */
export async function decideSubmission(id: string, decision: "approve" | "reject", by: string, reason: string | null): Promise<Decision> {
  const row = await submissionRow(id);
  if (!row) return { ok: false, error: "no such submission", status: 404 };
  if (row.status !== "review") return { ok: false, error: `submission is ${row.status}, not waiting for review`, status: 409 };

  if (decision === "reject") {
    await db().execute({
      sql: `UPDATE submissions SET status = 'rejected', error = 'declined', message = ?, reviewed_at = ?, reviewed_by = ?, reason = ? WHERE id = ?`,
      args: args([reason ?? "Declined by the reviewer.", now(), by, reason, id]),
    });
    return { ok: true, status: "rejected", slug: null, title: row.title };
  }

  const feedUrl = row.feed_url ?? "";
  const known = feedUrl ? await existing(feedUrl) : null;
  if (known) {
    await db().execute({
      sql: `UPDATE submissions SET status = 'existing', slug = ?, reviewed_at = ?, reviewed_by = ?, reason = ? WHERE id = ?`,
      args: args([known.slug, now(), by, reason, id]),
    });
    return { ok: true, status: "existing", slug: known.slug, title: known.title };
  }

  let stored: Omit<Podcast, "id" | "slug">;
  try {
    stored = JSON.parse(row.podcast ?? "") as Omit<Podcast, "id" | "slug">;
  } catch {
    return { ok: false, error: "the submission carries no show to list; submit the feed again", status: 409 };
  }
  let fresh: Omit<Podcast, "id" | "slug"> | null = null;
  try {
    const r = await resolveFeed(feedUrl, { kind: "podcast", timeoutMs: 10_000, userAgent: USER_AGENT, maxCandidates: 0 });
    if (r.ok && r.feed.title) fresh = rowFromFeed(r.feed, feedUrl, stored.host);
  } catch {
    /* the snapshot stands */
  }
  const toList = fresh ?? stored;
  const slug = await claimSlug(toList.title, feedUrl);
  await insertPodcast({ ...toList, slug });
  const listed = await one<Podcast>("SELECT * FROM podcasts WHERE slug = ?", [slug]);
  await db().execute({
    sql: `UPDATE submissions SET status = 'listed', slug = ?, title = ?, podcast = ?, reviewed_at = ?, reviewed_by = ?, reason = ? WHERE id = ?`,
    args: args([slug, toList.title, listed ? JSON.stringify(listed) : JSON.stringify(toList), now(), by, reason, id]),
  });
  void forward(feedUrl);
  return { ok: true, status: "listed", slug, title: toList.title };
}

/** Resolve every pending row in a batch, one at a time. */
export async function drainBatch(batchId: string): Promise<void> {
  const rows = await batchRows(batchId);
  for (const r of rows) {
    if (r.status === "pending") await resolveSubmission(r.id);
  }
}

/**
 * Pick up rows a crashed or restarted process left behind.
 *
 * Called from the status page, which is where somebody is waiting: a row in
 * `resolving` for longer than any resolve can take is put back to pending,
 * and the batch is drained again.
 */
export async function recoverBatch(batchId: string): Promise<boolean> {
  const res = await db().execute({
    sql: `UPDATE submissions SET status = 'pending'
          WHERE batch_id = ? AND status = 'resolving' AND created_at < ?`,
    args: [batchId, now() - STALE_SECONDS],
  });
  const pending = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM submissions WHERE batch_id = ? AND status = 'pending' AND created_at < ?",
    [batchId, now() - 60],
  );
  return res.rowsAffected > 0 || Number(pending?.n ?? 0) > 0;
}

/**
 * Turn one input into a show waiting for review, or say why not.
 *
 * The rules, in the order they are cheap to check: it must be a web address;
 * it must not already be here; it must resolve to a feed whose items carry
 * audio; its host must not be a hosting platform (Anchor excepted); it must
 * have a title; it must have published inside the directory's own 90-day
 * window; and it must not look like a bulk dump (ten or more episodes a day
 * on average). Every refusal is a code from the shared contract plus one
 * sentence for a person. A feed that passes is not listed here: the row it
 * would become goes back to the caller for the ledger, and a reviewer lists
 * it (decideSubmission).
 */
export async function listFeed(input: string): Promise<Outcome> {
  const known = await existing(input);
  if (known) return { status: "existing", ...known };

  const r = await resolveFeed(input, { kind: "podcast", timeoutMs: 10_000, userAgent: USER_AGENT, maxCandidates: 12 });
  if (!r.ok) {
    return { status: "rejected", error: r.error, message: explainError(r.error) };
  }
  const feedUrl = r.feedUrl;
  const feed = r.feed;

  const already = await existing(feedUrl);
  if (already) return { status: "existing", ...already };

  const host = hostOf(feedUrl);
  if (!host) return { status: "rejected", error: "invalid-url", message: explainError("invalid-url") };

  // The same show under another feed URL. The Podcast Index carries many
  // shows by a feed address the site no longer advertises (a CDN moved, a
  // query string was added), so a publisher who submits their site would
  // otherwise be listed twice, as title and title-2.
  const twin = await sameShow(feed.title, [host, hostOf(feed.link ?? "") ?? ""]);
  if (twin) return { status: "existing", ...twin };
  if (await isPlatformHost(host)) {
    return {
      status: "rejected",
      error: "hosted-platform",
      message: `${host} is a hosting platform, and this directory lists only shows on their own domain (or on Anchor). rssamplifier.com takes every feed.`,
    };
  }
  if (!feed.title) {
    return { status: "rejected", error: "not-eligible", message: "The feed has no title." };
  }

  const row = rowFromFeed(feed, feedUrl, host);
  const ageDays = (now() - row.newest_pubdate) / 86400;
  if (!row.newest_pubdate || ageDays > CUTOFF_DAYS) {
    return {
      status: "rejected",
      error: "not-eligible",
      message: `The newest episode is ${row.newest_pubdate ? `${Math.round(ageDays)} days` : "undated"} old; the directory lists shows that published inside the last ${CUTOFF_DAYS} days.`,
    };
  }
  if (row.per_week !== null && row.per_week >= 70) {
    return {
      status: "rejected",
      error: "not-eligible",
      message: "The feed averages ten or more episodes a day, which is the shape of a bulk dump rather than a show.",
    };
  }

  return { status: "review", title: feed.title, feedUrl, row };
}

/** A show already listed under this feed URL, by either spelling of the scheme. */
async function existing(url: string): Promise<{ slug: string; title: string; feedUrl: string } | null> {
  const variants = new Set<string>([url]);
  if (url.startsWith("https://")) variants.add(`http://${url.slice(8)}`);
  if (url.startsWith("http://")) variants.add(`https://${url.slice(7)}`);
  for (const v of [...variants]) {
    if (v.endsWith("/")) variants.add(v.slice(0, -1));
    else variants.add(`${v}/`);
  }
  const list = [...variants];
  const row = await one<{ slug: string; title: string; feed_url: string }>(
    `SELECT slug, title, feed_url FROM podcasts WHERE feed_url IN (${list.map(() => "?").join(",")}) LIMIT 1`,
    list,
  );
  return row ? { slug: row.slug, title: row.title, feedUrl: row.feed_url } : null;
}

/** A listed show with this title on one of these hosts. */
async function sameShow(title: string, hosts: string[]): Promise<{ slug: string; title: string; feedUrl: string } | null> {
  const hs = hosts.filter(Boolean);
  if (!title || !hs.length) return null;
  const row = await one<{ slug: string; title: string; feed_url: string }>(
    `SELECT slug, title, feed_url FROM podcasts
     WHERE title = ? COLLATE NOCASE AND host IN (${hs.map(() => "?").join(",")}) LIMIT 1`,
    [title.trim(), ...hs],
  );
  return row ? { slug: row.slug, title: row.title, feedUrl: row.feed_url } : null;
}

/** The slug the show is listed under: the title's, then -2, -3 … past any taken. */
async function claimSlug(title: string, feedUrl: string): Promise<string> {
  const base = uniqueSlug(title, { ascii: true, maxLength: 60, fallbackUrl: feedUrl });
  const taken = new Set(
    (await all<{ slug: string }>("SELECT slug FROM podcasts WHERE slug = ? OR slug LIKE ?", [base, `${base}-%`])).map((r) => r.slug),
  );
  return uniqueSlug(title, { ascii: true, maxLength: 60, fallbackUrl: feedUrl, taken: (s) => taken.has(s) });
}

/**
 * The `podcasts` row a parsed feed becomes.
 *
 * Kept in step with scripts/export_indie.py, which builds the same row from
 * the Podcast Index dump: same score, same cadence, same language folding,
 * same category words, so a submitted show ranks against the rest on equal
 * terms rather than on a different formula.
 */
export function rowFromFeed(feed: ParsedFeed, feedUrl: string, host: string): Omit<Podcast, "id" | "slug"> {
  const eps = feed.items
    .filter((i) => i.media?.kind === "audio")
    .map((i) => ({ ...i, at: i.published ? Math.floor(Date.parse(i.published) / 1000) : 0 }))
    .sort((a, b) => b.at - a.at);
  const ec = eps.length;
  const dated = eps.filter((e) => e.at > 0);
  const newest = dated[0]?.at ?? 0;
  const oldest = dated.length ? dated[dated.length - 1].at : null;
  const D = 86400;
  const span = oldest && newest > oldest ? (newest - oldest) / D : null;
  const rate = span && span >= 7 ? ec / span : null;
  const perWeek = rate ? Math.round(rate * 7 * 100) / 100 : null;
  const ageD = (now() - newest) / D;
  const fresh = ageD <= 7 ? 1.0 : ageD <= 30 ? 0.85 : ageD <= 60 ? 0.6 : 0.4;
  const depth = Math.log1p(Math.min(ec, 500));
  const longevity = Math.log1p((span ?? 0) / 30);
  const score = Math.round((depth * fresh + longevity * 0.5) * 10000) / 10000;
  const cats = categoryWords(feed.categories);
  const latest = eps[0];
  return {
    guid: feed.podcastGuid,
    feed_url: feedUrl,
    title: feed.title,
    description: feed.description.slice(0, 4000),
    image_url: feed.image ?? "",
    link: feed.link,
    host,
    author: feed.author,
    owner: feed.owner,
    explicit: feed.explicit ? 1 : 0,
    language: feed.language,
    lang_base: normalizeLang(feed.language ?? ""),
    category: cats[0] ?? null,
    categories: cats.join(","),
    episode_count: ec,
    newest_pubdate: newest,
    oldest_pubdate: oldest,
    created_on: now(),
    latest_audio: latest?.media?.url ?? null,
    latest_duration: latest?.media?.seconds ?? null,
    generator: feed.generator,
    per_week: perWeek,
    score,
  };
}

/**
 * "Religion & Spirituality", "Society & Culture" -> religion, spirituality,
 * society, culture: the single lowercase words the category pages are keyed
 * on, as the Podcast Index splits them.
 */
export function categoryWords(categories: string[]): string[] {
  const out: string[] = [];
  for (const c of categories) {
    for (const part of c.split(/\s*[&,/]\s*/)) {
      const w = part.trim().toLowerCase();
      if (w && !out.includes(w)) out.push(w);
    }
  }
  return out.slice(0, 5);
}

async function insertPodcast(row: Omit<Podcast, "id">): Promise<void> {
  const cols = [
    "slug", "guid", "feed_url", "title", "description", "image_url", "link", "host", "author", "owner",
    "explicit", "language", "lang_base", "category", "categories", "episode_count", "newest_pubdate",
    "oldest_pubdate", "created_on", "latest_audio", "latest_duration", "generator", "per_week", "score",
  ] as const;
  await db().execute({
    sql: `INSERT INTO podcasts(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`,
    args: args(cols.map((c) => row[c])),
  });
  const inserted = await one<{ id: number }>("SELECT id FROM podcasts WHERE slug = ?", [row.slug]);
  if (inserted) {
    // External-content FTS: rows are not indexed until told about.
    await db().execute({
      sql: "INSERT INTO podcasts_fts(rowid, title, description, author, host) VALUES(?,?,?,?,?)",
      args: args([inserted.id, row.title, row.description, row.author ?? "", row.host]),
    });
  }
}

/**
 * Tell rssamplifier.com too. Every self-hosted podcast is a small-web feed
 * that directory wants, and it takes the same contract, so a show submitted
 * here reaches both. Best effort and never awaited: a slow sibling must not
 * slow a submission here. SUBMIT_FORWARD_TO="" turns it off.
 */
async function forward(feedUrl: string): Promise<void> {
  const to = env("SUBMIT_FORWARD_TO") ?? (env("NODE_ENV") === "production" ? "https://rssamplifier.com" : "");
  if (!to) return;
  try {
    await submitFeed(to, { url: feedUrl }, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": USER_AGENT } });
  } catch {
    // Their problem to log, not ours to surface.
  }
}

/** The client address from a header reader, for the MCP tool which has no Request. */
export function clientIpFromHeader(header: (name: string) => string | null): string | null {
  const xff = header("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return header("x-real-ip") || null;
}
