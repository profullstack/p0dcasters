import { db, args } from "@/lib/db";
import { secret } from "@/lib/auth/crypto";
import { sendMail } from "@/lib/auth/mail";
import {
  NEWSLETTER_URL,
  SITE,
  UNSUBSCRIBE_PLACEHOLDER,
  buildIssue,
  describeSlot,
  ensureNewsletterTables,
  isoWeek,
  nextSlot,
  slotFor,
  slotFrom,
  sqlStore,
  verifyUnsubscribe,
  type Issue,
  type SenderDeps,
  type SqlDb,
  type StoredIssue,
} from "@/lib/newsletter";

/**
 * The web app's side of the weekly digest (src/lib/newsletter.ts): the
 * database through libsql-pg, the subscribe flag, the latest issue and the
 * live preview. The tables are created here on first use as well as by
 * db/schema.pg.sql, because nothing applies that file on deploy.
 */

let sqlDb: SqlDb | null = null;

export function newsletterDb(): SqlDb {
  sqlDb ??= {
    all: async <T,>(sql: string, params: unknown[] = []) => (await db().execute({ sql, args: args(params) })).rows as unknown as T[],
    run: async (sql: string, params: unknown[] = []) => Number((await db().execute({ sql, args: args(params) })).rowsAffected ?? 0),
  };
  return sqlDb;
}

export const ensureTables = () => ensureNewsletterTables(newsletterDb());

export async function isSubscribed(userId: number): Promise<boolean> {
  await ensureTables();
  const rows = await newsletterDb().all<{ newsletter: unknown }>("SELECT newsletter FROM users WHERE id = ?", [userId]);
  return Number(rows[0]?.newsletter ?? 1) === 1;
}

export async function setSubscribed(userId: number, on: boolean): Promise<boolean> {
  await ensureTables();
  const n = await newsletterDb().run("UPDATE users SET newsletter = ? WHERE id = ?", [on ? 1 : 0, userId]);
  return n > 0;
}

/** The ?u=&t= pair of an unsubscribe link, checked: the user id, or null. */
export function linkUser(u: unknown, t: unknown): number | null {
  return verifyUnsubscribe(u, t, secret()) ? Number(u) : null;
}

export type IssueSummary = {
  week: string;
  subject: string;
  createdAt: string;
  finishedAt: string | null;
  sent: number;
  url: string;
};

const iso = (s: number | null) => (s ? new Date(s * 1000).toISOString() : null);

export function summarise(i: StoredIssue): IssueSummary {
  return { week: i.week, subject: i.subject, createdAt: iso(i.created_at)!, finishedAt: iso(i.finished_at), sent: i.sent_count, url: NEWSLETTER_URL };
}

/** The most recent stored issue, or null before the first send. */
export async function latestIssue(): Promise<StoredIssue | null> {
  await ensureTables();
  const rows = await newsletterDb().all<{ week: string }>("SELECT week FROM newsletter_issues ORDER BY week DESC LIMIT 1");
  return rows[0] ? sqlStore(newsletterDb()).issue(rows[0].week) : null;
}

// The preview reads the whole directory (a count per network), and it is
// public: one build per quarter hour per process, shared by every caller.
const PREVIEW_TTL = 15 * 60 * 1000;
let preview: { at: number; week: string; issue: Promise<Issue> } | null = null;

/** This week's issue as it would be built now. No recipients, nothing written. */
export function previewIssue(now = new Date()): Promise<Issue> {
  const slotAt = slotFor(now, slotFrom(process.env));
  const week = isoWeek(slotAt);
  // Before the slot the window ends now; after it, at the slot, exactly as the send builds it.
  const until = Math.floor(Math.min(now.getTime(), slotAt.getTime()) / 1000);
  if (preview && preview.week === week && Date.now() - preview.at < PREVIEW_TTL) return preview.issue;
  const issue = sqlStore(newsletterDb()).gather(until, week).then(buildIssue);
  preview = { at: Date.now(), week, issue };
  issue.catch(() => (preview = null));
  return issue;
}

/** An issue's web copy: the unsubscribe link becomes the account page. */
export function webCopy(html: string): string {
  return html.split(UNSUBSCRIBE_PLACEHOLDER).join(`${SITE}/account`);
}

/** Schedule and latest issue: what /newsletter, /api/v1/newsletter and the MCP tool share. */
export async function newsletterInfo(now = new Date()) {
  const slot = slotFrom(process.env);
  const latest = await latestIssue().catch(() => null);
  return {
    schedule: describeSlot(slot),
    slot: { day: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][slot.day - 1], time: `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`, timezone: "UTC" },
    week: isoWeek(now),
    nextSendAt: nextSlot(now, slot).toISOString(),
    latest: latest ? summarise(latest) : null,
    page: NEWSLETTER_URL,
    preview: `${SITE}/api/v1/newsletter/preview`,
    subscribe: `${SITE}/account`,
    note: "Every account gets the digest unless it is turned off on /account or with the one-click link in any issue.",
  };
}

/** The sender's dependencies inside the web container (POST /api/v1/newsletter/send). */
export function webSender(): SenderDeps {
  return {
    store: sqlStore(newsletterDb()),
    key: secret(),
    send: (m) => sendMail(m.to, m.subject, m.html, m.text, m.headers),
    env: process.env,
    log: (msg) => console.log(msg),
  };
}
