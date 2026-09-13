import { env } from "@/lib/auth/crypto";
import { sendMail } from "@/lib/auth/mail";
import type { User } from "@/lib/auth/session";
import { SCOPE_REVIEW, type Principal } from "@/lib/openaccess";

/**
 * Who decides on a submission, and how they hear about one.
 *
 * A submitted feed is read and checked at once, but it is not listed until a
 * person has looked at it. The reviewer is a signed-in address in
 * ADMIN_EMAILS (an email list rather than a role column: there is one
 * operator, and a column would be a migration for a boolean nobody else
 * sets), or an OpenAccess principal whose grant carries `submissions:review`
 * -- which is how an agent Anthony delegates to can clear the queue.
 */
const DEFAULT_ADMINS = ["anthony@profullstack.com"];

export function adminEmails(): string[] {
  const raw = env("ADMIN_EMAILS");
  const list = raw ? raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  return list.length ? list : DEFAULT_ADMINS;
}

export function isAdmin(user: User | null): boolean {
  return Boolean(user && adminEmails().includes(user.email.toLowerCase()));
}

/** The reviewer's identity for the ledger, or null when the caller is not one. */
export function reviewerOf(user: User | null, principal: Principal | null): string | null {
  if (isAdmin(user)) return user!.email;
  if (principal?.scopes.includes(SCOPE_REVIEW)) return principal.sub;
  return null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** One email per submission that reached the queue, to every admin. */
export async function notifyReviewers(sub: {
  title: string;
  host: string;
  episodes: number;
  feedUrl: string;
  input: string;
  by: string | null;
}): Promise<void> {
  const url = "https://p0dcasters.com/admin/submissions";
  const who = sub.by || "anonymous";
  const text = `${sub.title}\n${sub.host} · ${sub.episodes} episodes\n${sub.feedUrl}\n\nSubmitted by ${who}${sub.input !== sub.feedUrl ? `\nPasted: ${sub.input}` : ""}\n\nReview: ${url}`;
  const html = `<!doctype html><html><body style="margin:0;background:#fbfaf7;padding:32px 16px;font:16px/1.6 Georgia,'Iowan Old Style','Times New Roman',serif;color:#1b1a17">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2ded4;border-radius:14px;padding:28px">
<p style="margin:0 0 20px;font-size:20px;font-weight:700;letter-spacing:-.02em;font-family:Menlo,Consolas,monospace">p<span style="color:#a8442a">0</span>dcasters</p>
<p style="margin:0 0 6px"><strong>${esc(sub.title)}</strong></p>
<p style="margin:0 0 6px;color:#6b675e">${esc(sub.host)} · ${sub.episodes} episodes</p>
<p style="margin:0 0 18px;font-size:14px;word-break:break-all"><a href="${esc(sub.feedUrl)}">${esc(sub.feedUrl)}</a></p>
<p style="margin:0 0 18px;font-size:14px;color:#6b675e">Submitted by ${esc(who)}</p>
<p style="margin:0"><a href="${url}" style="display:inline-block;background:#a8442a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">Review submissions</a></p>
</div></body></html>`;
  for (const to of adminEmails()) {
    try {
      await sendMail(to, `Podcast submitted: ${sub.title}`, html, text);
    } catch (e) {
      console.error("review mail:", e);
    }
  }
}
