import { createHmac } from "node:crypto";
import { equals } from "./auth/crypto";
import { NETWORKS, networkWhere } from "./networks";

/**
 * The weekly digest: one mail a week to every account that has not turned it
 * off, built from what the directory actually did that week.
 *
 * Everything here is pure or takes its side effects as arguments, so the web
 * app (src/lib/newsletter-store.ts, through libsql-pg) and the host daemon
 * (scripts/daemon.mjs, through Bun's SQL) run the same code against the same
 * tables, and the test runs it against fakes. Imports are relative for the
 * same reason: the daemon runs outside Next and has no `@/` alias to lean on.
 *
 * The rules that matter:
 *
 *   * The slot is Friday 15:00 UTC (NEWSLETTER_SLOT overrides). Before this
 *     week's slot a pass does nothing; after it, a pass sends to whoever is
 *     still owed this week's issue, so a pass every 15 minutes is a no-op
 *     outside the window and once everybody has it.
 *   * The issue is built once per ISO week and stored; every recipient gets
 *     the same issue, with only the unsubscribe link differing.
 *   * A `sending` row is written BEFORE the mail goes out. A crash between the
 *     two costs that person one issue; it can never send them two.
 */

export const SITE = "https://p0dcasters.com";
export const ACCOUNT_URL = `${SITE}/account`;
export const NEWSLETTER_URL = `${SITE}/newsletter`;
export const UNSUBSCRIBE_MAILTO = "mailto:unsubscribe@p0dcasters.com?subject=unsubscribe";

/** Stands in for each recipient's own unsubscribe URL in the stored issue. */
export const UNSUBSCRIBE_PLACEHOLDER = "%%P0D_UNSUBSCRIBE_URL%%";

const DAY = 86400;
const WEEK = 7 * DAY;
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

// --- the schedule -----------------------------------------------------------

/** When the digest goes out: an ISO weekday (1 = Monday) and a UTC time. */
export type Slot = { day: number; hour: number; minute: number };

/** Friday 15:00 UTC: morning in the Americas, the end of the working week in Europe. */
export const NEWSLETTER_SLOT: Slot = { day: 5, hour: 15, minute: 0 };

/** "FRI 15:00" -> a Slot; null for anything else. */
export function parseSlot(raw: string | undefined | null): Slot | null {
  const m = /^\s*([a-z]{3})[a-z]*\s+(\d{1,2}):(\d{2})\s*$/i.exec(raw ?? "");
  if (!m) return null;
  const day = DAYS.indexOf(m[1].toUpperCase()) + 1;
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (day < 1 || hour > 23 || minute > 59) return null;
  return { day, hour, minute };
}

/** The slot in force: NEWSLETTER_SLOT when it parses, otherwise Friday 15:00 UTC. */
export function slotFrom(env: Record<string, string | undefined> = process.env): Slot {
  return parseSlot(env["NEWSLETTER_SLOT"]) ?? NEWSLETTER_SLOT;
}

export function describeSlot(slot: Slot): string {
  const names = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
  return `${names[slot.day - 1]} at ${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")} UTC`;
}

/** Monday 00:00 UTC of the ISO week `date` falls in. */
function weekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay() || 7; // Sunday is the 7th day of an ISO week
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d;
}

/** The ISO 8601 week key, e.g. "2026-W44". The year is the week's, not the date's. */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay() || 7;
  // The week belongs to the year its Thursday is in.
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - jan1) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** This ISO week's send time. */
export function slotFor(date: Date, slot: Slot = NEWSLETTER_SLOT): Date {
  const d = weekStart(date);
  d.setUTCDate(d.getUTCDate() + slot.day - 1);
  d.setUTCHours(slot.hour, slot.minute, 0, 0);
  return d;
}

/** The next send time strictly after `date` (this week's slot, or next week's). */
export function nextSlot(date: Date, slot: Slot = NEWSLETTER_SLOT): Date {
  const here = slotFor(date, slot);
  return here.getTime() > date.getTime() ? here : new Date(here.getTime() + WEEK * 1000);
}

// --- the unsubscribe token --------------------------------------------------

/**
 * An HMAC of the user id under AUTH_SECRET, so a link can unsubscribe exactly
 * one account without a session and without a token table. The key is passed
 * in rather than read here: the host daemon has to fetch AUTH_SECRET from the
 * vault, and a missing key must fail rather than fall back to a dev secret
 * that would mint links the site cannot verify.
 */
export function unsubscribeToken(userId: number | string, key: string): string {
  if (!key) throw new Error("unsubscribeToken: no key");
  return createHmac("sha256", key).update(`p0d-newsletter-unsubscribe:${userId}`).digest("base64url");
}

export function verifyUnsubscribe(userId: unknown, token: unknown, key: string): boolean {
  if (typeof token !== "string" || !token) return false;
  const id = String(userId ?? "");
  if (!/^\d{1,18}$/.test(id)) return false;
  return equals(token, unsubscribeToken(id, key));
}

export function unsubscribeUrl(userId: number | string, key: string): string {
  return `${SITE}/newsletter/unsubscribe?u=${userId}&t=${unsubscribeToken(userId, key)}`;
}

/** RFC 2369 + RFC 8058: the mail client's own unsubscribe button. */
export function listUnsubscribeHeaders(userId: number | string, key: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(userId, key)}>, <${UNSUBSCRIBE_MAILTO}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// --- what goes in it --------------------------------------------------------

export type IssueShow = { slug: string; title: string; host: string; author: string | null; newest?: number | null };
export type IssueData = {
  week: string;
  /** The window the issue covers, unix seconds: [since, until). */
  since: number;
  until: number;
  added: { count: number; shows: IssueShow[] };
  followed: (IssueShow & { follows: number })[];
  fresh: IssueShow[];
  networks: { slug: string; name: string; shows: number }[];
};

/** The one thing the issue builder needs from a database: rows for a query. `?` placeholders. */
export type Query = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

const SHOW_COLS = "slug, title, host, author, newest_pubdate";
type ShowRow = { slug: string; title: string; host: string; author: string | null; newest_pubdate: unknown };
const show = (r: ShowRow): IssueShow => ({ slug: r.slug, title: r.title, host: r.host, author: r.author ?? null, newest: r.newest_pubdate == null ? null : Number(r.newest_pubdate) });

/**
 * The week's numbers from the live tables. "Added" is a show new to the
 * directory in the window: its feed first appeared in Podcast Index then
 * (`created_on`), or a publisher's own submission was listed then. Follows are
 * keyed by slug like everywhere else. Every query is bounded.
 */
export async function gatherIssueData(q: Query, until: number, week: string): Promise<IssueData> {
  const since = until - WEEK;
  const addedWhere = `(created_on >= ? AND created_on < ?) OR slug IN (SELECT slug FROM submissions WHERE status = 'listed' AND slug IS NOT NULL AND COALESCE(reviewed_at, resolved_at, created_at) >= ? AND COALESCE(reviewed_at, resolved_at, created_at) < ?)`;
  const addedArgs = [since, until, since, until];
  const nets = NETWORKS.map((n) => ({ n, w: networkWhere(n) }));
  const [addedCount, addedRows, followed, fresh, netRows] = await Promise.all([
    q<{ n: unknown }>(`SELECT COUNT(*) AS n FROM podcasts WHERE ${addedWhere}`, addedArgs),
    q<ShowRow>(`SELECT ${SHOW_COLS} FROM podcasts WHERE ${addedWhere} ORDER BY score DESC LIMIT 8`, addedArgs),
    q<ShowRow & { follows: unknown }>(
      `SELECT p.slug, p.title, p.host, p.author, p.newest_pubdate, f.follows
         FROM (SELECT slug, COUNT(*) AS follows FROM follows WHERE created_at >= ? AND created_at < ? GROUP BY slug) f
         JOIN podcasts p ON p.slug = f.slug
        ORDER BY f.follows DESC, p.score DESC LIMIT 5`,
      [since, until],
    ),
    // The deep catalogues that published this week: the same bar as the home page's list.
    q<ShowRow>(`SELECT ${SHOW_COLS} FROM podcasts WHERE newest_pubdate >= ? AND newest_pubdate < ? AND episode_count >= 8 ORDER BY score DESC LIMIT 8`, [since, until]),
    nets.length
      ? q<{ slug: string; n: unknown }>(
          // The slug is a literal (it comes from networks.json, not a request):
          // an untyped `? AS slug` parameter in a UNION has no type in Postgres.
          nets
            .map(({ n, w }) => `SELECT '${n.slug.replace(/[^a-z0-9-]/g, "")}' AS slug, COUNT(*) AS n FROM podcasts WHERE newest_pubdate >= ? AND newest_pubdate < ? AND ${w.sql}`)
            .join(" UNION ALL "),
          nets.flatMap(({ w }) => [since, until, ...w.params]),
        )
      : Promise.resolve([]),
  ]);
  const count = new Map(netRows.map((r) => [r.slug, Number(r.n)]));
  return {
    week,
    since,
    until,
    added: { count: Number(addedCount[0]?.n ?? 0), shows: addedRows.map(show) },
    followed: followed.map((r) => ({ ...show(r), follows: Number(r.follows) })),
    fresh: fresh.map(show),
    networks: NETWORKS.map((n) => ({ slug: n.slug, name: n.name, shows: count.get(n.slug) ?? 0 }))
      .filter((n) => n.shows > 0)
      .sort((a, b) => b.shows - a.shows)
      .slice(0, 6),
  };
}

// --- the mail ---------------------------------------------------------------

export type Issue = { week: string; subject: string; html: string; text: string; sections: number };

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function clip(s: string, n: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

const page = (slug: string) => `${SITE}/podcast/${encodeURIComponent(slug)}`;
const n = (v: number) => v.toLocaleString("en-US");
const byline = (s: IssueShow) => (s.author && s.author.trim() && s.author.trim() !== s.host ? `${clip(s.author, 60)} · ${s.host}` : s.host);

type Section = { title: string; lead?: string; items: { href: string; label: string; note: string }[] };

/**
 * The issue as mail, in the house look of linkMail() (src/lib/auth/mail.ts):
 * the same card, type and accent. A section with nothing in it is left out;
 * an issue with no sections at all says so (`sections: 0`) and is not sent.
 * The unsubscribe link is UNSUBSCRIBE_PLACEHOLDER until personalise().
 */
export function buildIssue(data: IssueData): Issue {
  const sections: Section[] = [];
  if (data.added.count > 0 && data.added.shows.length) {
    sections.push({
      title: "New in the directory",
      lead: `${n(data.added.count)} ${data.added.count === 1 ? "show" : "shows"} joined p0dcasters this week. The ones with the deepest catalogues:`,
      items: data.added.shows.map((s) => ({ href: page(s.slug), label: clip(s.title, 90), note: byline(s) })),
    });
  }
  if (data.followed.length) {
    sections.push({
      title: "Most followed this week",
      items: data.followed.map((s) => ({ href: page(s.slug), label: clip(s.title, 90), note: `${n(s.follows)} new ${s.follows === 1 ? "follower" : "followers"} · ${s.host}` })),
    });
  }
  if (data.fresh.length) {
    sections.push({
      title: "New episodes from the big catalogues",
      lead: "Long-running shows that published this week.",
      items: data.fresh.map((s) => ({
        href: page(s.slug),
        label: clip(s.title, 90),
        note: s.newest ? `${byline(s)} · ${new Date(s.newest * 1000).toISOString().slice(0, 10)}` : byline(s),
      })),
    });
  }
  if (data.networks.length) {
    sections.push({
      title: "From the networks",
      items: data.networks.map((x) => ({ href: `${SITE}/networks/${encodeURIComponent(x.slug)}`, label: x.name, note: `${n(x.shows)} ${x.shows === 1 ? "show" : "shows"} published this week` })),
    });
  }

  const subject = data.added.count > 0
    ? `p0dcasters weekly: ${n(data.added.count)} new ${data.added.count === 1 ? "show" : "shows"} (${data.week})`
    : `p0dcasters weekly (${data.week})`;
  const intro = "What happened in the podcast directory this week.";

  const textBody = sections
    .map((s) => `${s.title.toUpperCase()}\n${s.lead ? `${s.lead}\n` : ""}\n${s.items.map((i) => `- ${i.label} (${i.note})\n  ${i.href}`).join("\n")}`)
    .join("\n\n");
  const text =
    `p0dcasters weekly, ${data.week}\n${intro}\n\n${textBody}\n\n` +
    `--\nYou get this because you have a p0dcasters account and the weekly digest is on.\n` +
    `Unsubscribe (one click): ${UNSUBSCRIBE_PLACEHOLDER}\nAccount settings: ${ACCOUNT_URL}\n`;

  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
  const sectionHtml = sections
    .map(
      (s) => `<h2 style="margin:26px 0 8px;font-size:17px;letter-spacing:-.01em">${esc(s.title)}</h2>
${s.lead ? `<p style="margin:0 0 10px;color:#6b675e;font-size:14px">${esc(s.lead)}</p>` : ""}
<ul style="margin:0;padding:0;list-style:none">
${s.items.map((i) => `<li style="margin:0 0 10px"><a href="${esc(i.href)}" style="color:#a8442a;font-weight:700;text-decoration:none">${esc(i.label)}</a><br><span style="color:#6b675e;font-size:13px;font-family:${sans}">${esc(i.note)}</span></li>`).join("\n")}
</ul>`,
    )
    .join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head><body style="margin:0;background:#fbfaf7;padding:32px 16px;font:16px/1.6 Georgia,'Iowan Old Style','Times New Roman',serif;color:#1b1a17">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2ded4;border-radius:14px;padding:28px">
<p style="margin:0 0 6px;font-size:20px;font-weight:700;letter-spacing:-.02em;font-family:Menlo,Consolas,monospace">p<span style="color:#a8442a">0</span>dcasters <span style="color:#6b675e;font-size:14px;font-weight:400">weekly · ${esc(data.week)}</span></p>
<p style="margin:0">${esc(intro)}</p>
${sectionHtml}
<p style="margin:26px 0 0"><a href="${SITE}/" style="display:inline-block;background:#a8442a;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:9px;font-family:${sans}">Open the directory</a></p>
</div>
<div style="max-width:560px;margin:16px auto 0;color:#6b675e;font-size:13px;font-family:${sans};text-align:center">
<p style="margin:0 0 6px">You get this because you have a p0dcasters account and the weekly digest is on.</p>
<p style="margin:0"><a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:#6b675e">Unsubscribe</a> (one click) · <a href="${ACCOUNT_URL}" style="color:#6b675e">Account settings</a> · <a href="${NEWSLETTER_URL}" style="color:#6b675e">About the digest</a></p>
</div></body></html>`;

  return { week: data.week, subject, html, text, sections: sections.length };
}

/** The stored issue with one recipient's unsubscribe link in it. */
export function personalise(issue: { html: string; text: string }, unsubscribe: string): { html: string; text: string } {
  return {
    html: issue.html.split(UNSUBSCRIBE_PLACEHOLDER).join(esc(unsubscribe)),
    text: issue.text.split(UNSUBSCRIBE_PLACEHOLDER).join(unsubscribe),
  };
}

// --- the store --------------------------------------------------------------

/** Postgres DDL; db/schema.pg.sql carries the same. Idempotent, run once per process. */
export const NEWSLETTER_DDL = [
  // Opted in by default: existing rows take the default too, by the owner's decision.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS newsletter integer NOT NULL DEFAULT 1`,
  `CREATE TABLE IF NOT EXISTS newsletter_issues(
     week text PRIMARY KEY,
     subject text NOT NULL,
     html text NOT NULL,
     text text NOT NULL,
     created_at bigint NOT NULL,
     sent_count bigint NOT NULL DEFAULT 0,
     finished_at bigint)`,
  `CREATE TABLE IF NOT EXISTS newsletter_sends(
     week text NOT NULL,
     user_id bigint NOT NULL,
     status text NOT NULL,
     at bigint NOT NULL,
     error text,
     PRIMARY KEY (week, user_id))`,
];

export type StoredIssue = { week: string; subject: string; html: string; text: string; created_at: number; sent_count: number; finished_at: number | null };
export type Recipient = { id: number; email: string };

/** What the sender needs from the database, so the test can hand it a fake. */
export type NewsletterStore = {
  ensure(): Promise<void>;
  gather(until: number, week: string): Promise<IssueData>;
  issue(week: string): Promise<StoredIssue | null>;
  /** Inserts the issue unless the week already has one. */
  saveIssue(issue: Issue, at: number): Promise<void>;
  /** Opted-in accounts made before `createdBefore` with no row for the week. */
  pending(week: string, createdBefore: number, limit: number): Promise<Recipient[]>;
  pendingCount(week: string, createdBefore: number): Promise<number>;
  /** Writes the `sending` row; false when the row already existed. */
  claim(week: string, userId: number, at: number): Promise<boolean>;
  mark(week: string, userId: number, status: "sent" | "failed", at: number, error?: string | null): Promise<void>;
  finish(week: string, at: number): Promise<void>;
};

/** A database as a row-reader and a statement-runner (rows affected), `?` placeholders. */
export type SqlDb = { all: Query; run(sql: string, params?: unknown[]): Promise<number> };

const ensured = new WeakMap<object, Promise<void>>();

/** Runs NEWSLETTER_DDL once per process per database. */
export function ensureNewsletterTables(db: SqlDb): Promise<void> {
  let p = ensured.get(db);
  if (!p) {
    p = (async () => {
      for (const sql of NEWSLETTER_DDL) await db.run(sql);
    })();
    // A failure is retried on the next call rather than remembered forever.
    p.catch(() => ensured.delete(db));
    ensured.set(db, p);
  }
  return p;
}

/**
 * Before NEWSLETTER_DDL has run (a dry run against a database nothing has
 * migrated yet) the column and tables are missing; the reads that a dry run
 * makes answer as the migration would leave things instead of failing.
 */
async function unmigrated<T>(p: Promise<T[]>, fallback: T[] | (() => Promise<T[]>)): Promise<T[]> {
  try {
    return await p;
  } catch (err) {
    if (!/does not exist|no such (table|column)/i.test(String((err as Error)?.message ?? err))) throw err;
    return typeof fallback === "function" ? fallback() : fallback;
  }
}

export function sqlStore(db: SqlDb, { ddl = true } = {}): NewsletterStore {
  const issueRow = (r: Record<string, unknown> | undefined): StoredIssue | null =>
    r
      ? {
          week: String(r.week),
          subject: String(r.subject),
          html: String(r.html),
          text: String(r.text),
          created_at: Number(r.created_at),
          sent_count: Number(r.sent_count ?? 0),
          finished_at: r.finished_at == null ? null : Number(r.finished_at),
        }
      : null;
  return {
    ensure: () => (ddl ? ensureNewsletterTables(db) : Promise.resolve()),
    gather: (until, week) => gatherIssueData(db.all, until, week),
    async issue(week) {
      return issueRow((await unmigrated(db.all("SELECT * FROM newsletter_issues WHERE week = ?", [week]), []))[0]);
    },
    async saveIssue(issue, at) {
      await db.run(
        "INSERT INTO newsletter_issues(week, subject, html, text, created_at, sent_count) VALUES(?,?,?,?,?,0) ON CONFLICT (week) DO NOTHING",
        [issue.week, issue.subject, issue.html, issue.text, at],
      );
    },
    async pending(week, createdBefore, limit) {
      const rows = await db.all<{ id: unknown; email: string }>(
        `SELECT u.id, u.email FROM users u
          WHERE u.newsletter = 1 AND u.created_at <= ?
            AND NOT EXISTS (SELECT 1 FROM newsletter_sends s WHERE s.week = ? AND s.user_id = u.id)
          ORDER BY u.id LIMIT ?`,
        [createdBefore, week, limit],
      );
      return rows.map((r) => ({ id: Number(r.id), email: r.email }));
    },
    async pendingCount(week, createdBefore) {
      const rows = await unmigrated(
        db.all<{ n: unknown }>(
          `SELECT COUNT(*) AS n FROM users u
            WHERE u.newsletter = 1 AND u.created_at <= ?
              AND NOT EXISTS (SELECT 1 FROM newsletter_sends s WHERE s.week = ? AND s.user_id = u.id)`,
          [createdBefore, week],
        ),
        () => db.all<{ n: unknown }>("SELECT COUNT(*) AS n FROM users WHERE created_at <= ?", [createdBefore]),
      );
      return Number(rows[0]?.n ?? 0);
    },
    async claim(week, userId, at) {
      const n = await db.run("INSERT INTO newsletter_sends(week, user_id, status, at) VALUES(?,?,'sending',?) ON CONFLICT (week, user_id) DO NOTHING", [week, userId, at]);
      return n === 1;
    },
    async mark(week, userId, status, at, error = null) {
      await db.run("UPDATE newsletter_sends SET status = ?, at = ?, error = ? WHERE week = ? AND user_id = ?", [status, at, error ? error.slice(0, 500) : null, week, userId]);
    },
    async finish(week, at) {
      await db.run(
        "UPDATE newsletter_issues SET finished_at = ?, sent_count = (SELECT COUNT(*) FROM newsletter_sends WHERE week = ? AND status = 'sent') WHERE week = ? AND finished_at IS NULL",
        [at, week, week],
      );
    },
  };
}

// --- the sender -------------------------------------------------------------

export type Mail = { to: string; subject: string; html: string; text: string; headers: Record<string, string> };

export type SenderDeps = {
  store: NewsletterStore;
  send(mail: Mail): Promise<void>;
  /** AUTH_SECRET: signs each recipient's unsubscribe link. */
  key: string;
  env?: Record<string, string | undefined>;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
};

export type RunResult = {
  week: string;
  slotAt: string;
  nextAt: string;
  state: "disabled" | "before-slot" | "empty" | "done" | "sent" | "dry-run";
  /** Accounts still owed this week's issue before this pass. */
  recipients: number;
  sent: number;
  failed: number;
  remaining: number;
  /** Why the pass stopped early, when it did. */
  stopped?: string;
  issue?: Issue | StoredIssue;
};

export const SEND_GAP_MS = 600;
export const DEFAULT_BATCH = 200;
export const MAX_FAILURES_IN_A_ROW = 3;

/**
 * One pass of the weekly send. Sequential, SEND_GAP_MS between mails, at most
 * `limit` (NEWSLETTER_BATCH, default 200) per pass; the next pass carries on.
 * `dryRun` sends nothing and writes nothing, and works before the slot too, so
 * an issue can be read before it goes out. NEWSLETTER_SEND=0 stops real sends.
 */
export async function runWeeklyNewsletter(
  deps: SenderDeps,
  { dryRun = false, limit, now = new Date() }: { dryRun?: boolean; limit?: number; now?: Date } = {},
): Promise<RunResult> {
  const env = deps.env ?? process.env;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? (() => {});
  const slot = slotFrom(env);
  const slotAt = slotFor(now, slot);
  const week = isoWeek(slotAt);
  const until = Math.floor(slotAt.getTime() / 1000);
  const batch = Math.max(1, Math.floor(Number(limit ?? env["NEWSLETTER_BATCH"] ?? DEFAULT_BATCH)) || DEFAULT_BATCH);
  const base = { week, slotAt: slotAt.toISOString(), nextAt: nextSlot(now, slot).toISOString(), recipients: 0, sent: 0, failed: 0, remaining: 0 };

  if (!dryRun && env["NEWSLETTER_SEND"] === "0") return { ...base, state: "disabled" };
  if (!dryRun && now.getTime() < slotAt.getTime()) return { ...base, state: "before-slot" };

  // A dry run does not even migrate: the store reads an unmigrated database
  // as "every account opted in, nothing sent yet", which is what the DDL makes it.
  if (!dryRun) await deps.store.ensure();
  let issue: Issue | StoredIssue | null = await deps.store.issue(week);
  const recipients = await deps.store.pendingCount(week, until);

  if (dryRun) {
    issue ??= buildIssue(await deps.store.gather(until, week));
    return { ...base, state: "dry-run", recipients, remaining: recipients, issue };
  }

  if (issue?.finished_at) return { ...base, state: "done", issue };
  if (!issue) {
    const built = buildIssue(await deps.store.gather(until, week));
    if (built.sections === 0) {
      log(`newsletter ${week}: nothing happened this week, not sending`);
      return { ...base, state: "empty", recipients, remaining: recipients, issue: built };
    }
    await deps.store.saveIssue(built, Math.floor(now.getTime() / 1000));
    // Re-read: if another process stored the week first, everybody gets that one.
    issue = (await deps.store.issue(week)) ?? built;
  }

  let sent = 0;
  let failed = 0;
  let inARow = 0;
  let stopped: string | undefined;
  const people = recipients ? await deps.store.pending(week, until, batch) : [];
  for (const [i, person] of people.entries()) {
    // A bad key or a Resend outage fails every send alike: stop after a few
    // rather than burn the whole list's week on it. The rest stay owed.
    if (inARow >= MAX_FAILURES_IN_A_ROW) {
      stopped = `${inARow} sends in a row failed`;
      log(`newsletter ${week}: ${stopped}, stopping this pass`);
      break;
    }
    if (i > 0) await sleep(SEND_GAP_MS);
    const at = Math.floor(Date.now() / 1000);
    if (!(await deps.store.claim(week, person.id, at))) continue;
    try {
      const body = personalise(issue, unsubscribeUrl(person.id, deps.key));
      await deps.send({ to: person.email, subject: issue.subject, ...body, headers: listUnsubscribeHeaders(person.id, deps.key) });
      await deps.store.mark(week, person.id, "sent", Math.floor(Date.now() / 1000));
      sent++;
      inARow = 0;
    } catch (err) {
      failed++;
      inARow++;
      const message = err instanceof Error ? err.message : String(err);
      log(`newsletter ${week}: send to user ${person.id} failed: ${message}`);
      await deps.store.mark(week, person.id, "failed", Math.floor(Date.now() / 1000), message).catch(() => {});
    }
  }

  const remaining = await deps.store.pendingCount(week, until);
  if (remaining === 0) await deps.store.finish(week, Math.floor(Date.now() / 1000));
  if (people.length) log(`newsletter ${week}: ${sent} sent, ${failed} failed, ${remaining} still owed`);
  return { ...base, state: remaining === 0 && people.length === 0 ? "done" : "sent", recipients, sent, failed, remaining, ...(stopped ? { stopped } : {}), issue };
}
