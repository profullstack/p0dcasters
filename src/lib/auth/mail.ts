import { env } from "./crypto";

const FROM = "p0dcasters <noreply@p0dcasters.com>";

/**
 * Resend's REST API directly — the SDK adds a dependency for one POST.
 * Sending is verified on the `send.p0dcasters.com` subdomain; the root MX
 * belongs to Forward Email, so the two halves never collide.
 */
export async function sendMail(to: string, subject: string, html: string, text: string) {
  const key = env("RESEND_API_KEY");
  if (!key) {
    if (env("NODE_ENV") === "production") throw new Error("RESEND_API_KEY is not set");
    console.log(`\n--- magic link mail to ${to} ---\n${text}\n---\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  });
  if (!res.ok) {
    throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export function linkMail(url: string, isNew: boolean) {
  const verb = isNew ? "Finish setting up your account" : "Sign in to p0dcasters";
  const text = `${verb}\n\n${url}\n\nThe link works once and expires in 15 minutes. If you did not ask for it, ignore this email — nothing happens until it is opened.`;
  const html = `<!doctype html><html><body style="margin:0;background:#fbfaf7;padding:32px 16px;font:16px/1.6 Georgia,'Iowan Old Style','Times New Roman',serif;color:#1b1a17">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2ded4;border-radius:14px;padding:28px">
<p style="margin:0 0 20px;font-size:20px;font-weight:700;letter-spacing:-.02em;font-family:Menlo,Consolas,monospace">p<span style="color:#a8442a">0</span>dcasters</p>
<p style="margin:0 0 22px">${verb}.</p>
<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#a8442a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">${isNew ? "Create my account" : "Sign in"}</a></p>
<p style="margin:0 0 8px;color:#6b675e;font-size:14px">The link works once and expires in 15 minutes.</p>
<p style="margin:0;color:#6b675e;font-size:14px">If you did not ask for it, ignore this email — nothing happens until it is opened.</p>
</div></body></html>`;
  return { subject: verb, html, text };
}
