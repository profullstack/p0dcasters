import { promoBlock } from "@profullstack/cross-promo";
import { all, db, args } from "@/lib/db";
import { now } from "@/lib/auth/crypto";
import { sendMail } from "@/lib/auth/mail";
import { isCrawlerSource } from "@/lib/crawler-submit";

/**
 * The submitter's side of review: one email per submission batch, once a
 * person has decided on it.
 *
 * Every human submission carries a contact address (the form asks for one;
 * a signed-in listener's account address stands in). When the last row of a
 * batch leaves the queue, the batch is claimed by stamping `notified_at` on
 * every row in one UPDATE, so two reviewers clearing the same batch at once,
 * or a retry, still send a single mail. A batch nobody had to review (every
 * row refused or already listed on the spot) is not mailed: the person saw
 * that answer on the page. Crawler rows never are.
 */

const SITE = "https://p0dcasters.com";
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

/** A plausible address, trimmed and lower-cased, or null. */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  return s.length <= 254 && EMAIL.test(s) ? s : null;
}

/** The `email` field of a submit request body, whatever shape it came in. */
export function emailField(body: unknown): unknown {
  if (body && typeof (body as FormData).get === "function") return (body as FormData).get("email");
  if (body && typeof body === "object") return (body as Record<string, unknown>).email;
  return null;
}

type BatchRow = {
  id: string;
  input: string;
  feed_url: string | null;
  slug: string | null;
  title: string | null;
  status: string;
  message: string | null;
  reason: string | null;
  reviewed_at: number | null;
  contact_email: string | null;
  submitted_by: string | null;
  notified_at: number | null;
};

const OPEN = new Set(["pending", "resolving", "review"]);

/** What the mail says about a settled batch, or null when no mail is due. */
export function batchNotice(rows: BatchRow[]): { to: string; subject: string; text: string; lines: Line[] } | null {
  if (!rows.length) return null;
  if (rows.some((r) => OPEN.has(r.status))) return null;
  if (rows.some((r) => r.notified_at)) return null;
  if (!rows.some((r) => r.reviewed_at)) return null;
  if (rows.some((r) => isCrawlerSource(r.submitted_by))) return null;
  const to = rows.find((r) => r.contact_email)?.contact_email;
  if (!to) return null;

  const lines: Line[] = rows.map((r) => {
    const name = r.title || r.feed_url || r.input;
    if (r.status === "listed") return { kind: "listed", name, url: `${SITE}/podcast/${r.slug}` };
    if (r.status === "existing") return { kind: "existing", name, url: r.slug ? `${SITE}/podcast/${r.slug}` : null };
    return { kind: "rejected", name, url: null, why: r.reason || r.message || "It did not pass review." };
  });
  const listed = lines.filter((l) => l.kind !== "rejected").length;
  const subject =
    rows.length === 1
      ? lines[0].kind === "rejected"
        ? `Not listed on p0dcasters: ${lines[0].name}`
        : `Your show is live on p0dcasters: ${lines[0].name}`
      : `${listed} of ${rows.length} shows listed on p0dcasters`;
  const text = lines
    .map((l) =>
      l.kind === "listed"
        ? `Listed: ${l.name}\n  ${l.url}`
        : l.kind === "existing"
          ? `Already listed: ${l.name}${l.url ? `\n  ${l.url}` : ""}`
          : `Not listed: ${l.name}\n  ${l.why}`,
    )
    .join("\n\n");
  return { to, subject, text, lines };
}

type Line = { kind: "listed" | "existing" | "rejected"; name: string; url: string | null; why?: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function lineHtml(l: Line): string {
  const label = l.kind === "listed" ? "Listed" : l.kind === "existing" ? "Already listed" : "Not listed";
  const name = l.url ? `<a href="${esc(l.url)}" style="color:#a8442a">${esc(l.name)}</a>` : esc(l.name);
  const why = l.why ? `<br><span style="color:#6b675e;font-size:14px">${esc(l.why)}</span>` : "";
  return `<p style="margin:0 0 12px"><strong>${label}:</strong> ${name}${why}</p>`;
}

/**
 * Send the batch's notice if it has just settled. Safe to call after every
 * decision: it does nothing until the batch is done, and claims it first.
 */
export async function notifyBatchIfSettled(batchId: string): Promise<boolean> {
  try {
    const rows = await all<BatchRow>(
      `SELECT id, input, feed_url, slug, title, status, message, reason, reviewed_at, contact_email, submitted_by, notified_at
       FROM submissions WHERE batch_id = ?`,
      [batchId],
    );
    const notice = batchNotice(rows);
    if (!notice) return false;
    const claim = await db().execute({
      sql: "UPDATE submissions SET notified_at = ? WHERE batch_id = ? AND notified_at IS NULL",
      args: args([now(), batchId]),
    });
    if (!claim.rowsAffected) return false;

    const promo = await promoBlock({ site: "p0dcasters.com", audience: "podcasters", seed: notice.to });
    const live = notice.lines.some((l) => l.kind !== "rejected");
    const lead = live
      ? "Thanks for adding to p0dcasters. A person looked, and here is where it landed:"
      : "Thanks for the submission. A person looked at it, and it is not listed for now:";
    const after = live
      ? "Share the page with your listeners: it has a player, a playlist and a follow button. New episodes show up on their own."
      : "Fix what is named above and submit it again at https://p0dcasters.com/submit.";
    const text = `${lead}\n\n${notice.text}\n\n${after}\n\n${promo.text}`.trim() + "\n";
    const html = `<!doctype html><html><body style="margin:0;background:#fbfaf7;padding:32px 16px;font:16px/1.6 Georgia,'Iowan Old Style','Times New Roman',serif;color:#1b1a17">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2ded4;border-radius:14px;padding:28px">
<p style="margin:0 0 20px;font-size:20px;font-weight:700;letter-spacing:-.02em;font-family:Menlo,Consolas,monospace">p<span style="color:#a8442a">0</span>dcasters</p>
<p style="margin:0 0 18px">${esc(lead)}</p>
${notice.lines.map(lineHtml).join("\n")}
<p style="margin:18px 0 0;color:#6b675e;font-size:14px">${esc(after)}</p>
${promo.html ? `<div style="margin-top:24px;border-top:1px solid #e2ded4;padding-top:18px">${promo.html}</div>` : ""}
</div></body></html>`;
    await sendMail(notice.to, notice.subject, html, text);
    return true;
  } catch (e) {
    console.error("submitter mail:", e);
    return false;
  }
}
