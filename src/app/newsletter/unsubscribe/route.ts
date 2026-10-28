import { linkUser, setSubscribed } from "@/lib/newsletter-store";

export const dynamic = "force-dynamic";

/**
 * The unsubscribe link in every issue, /newsletter/unsubscribe?u=<id>&t=<hmac>.
 *
 *   GET   a reader's click: unsubscribes, then 303s to /newsletter/unsubscribed,
 *         which says so and offers the way back.
 *   HEAD  records nothing; link checkers and previewers HEAD a URL first.
 *   POST  RFC 8058 one-click, the mail client's own button: the body is
 *         `List-Unsubscribe=One-Click` and the answer is a bare 200.
 *
 * The token is an HMAC of the user id under AUTH_SECRET; a bad one is a 400
 * and changes nothing.
 */
function params(req: Request) {
  const q = new URL(req.url).searchParams;
  return { u: q.get("u"), t: q.get("t") };
}

const bad = () =>
  new Response("That unsubscribe link is not valid. Turn the digest off on https://p0dcasters.com/account instead.", {
    status: 400,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

export async function GET(req: Request) {
  const { u, t } = params(req);
  const id = linkUser(u, t);
  if (id === null) return bad();
  await setSubscribed(id, false);
  const qs = new URLSearchParams({ u: String(id), t: t! });
  // Relative, so it follows whatever host the reader came in on.
  return new Response(null, { status: 303, headers: { location: `/newsletter/unsubscribed?${qs}`, "cache-control": "no-store" } });
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  let { u, t } = params(req);
  // The URL carries the pair; a hand-made form may put it in the body instead.
  if (!u || !t) {
    const form = await req.formData().catch(() => null);
    u = u || (form?.get("u") as string | null) || null;
    t = t || (form?.get("t") as string | null) || null;
  }
  const id = linkUser(u, t);
  if (id === null) return bad();
  await setSubscribed(id, false);
  return new Response("Unsubscribed from the p0dcasters weekly digest.", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
