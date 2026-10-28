import { linkUser, setSubscribed } from "@/lib/newsletter-store";

export const dynamic = "force-dynamic";

/**
 * The Re-subscribe button on /newsletter/unsubscribed: a form POST of the same
 * u and t the unsubscribe link carried, so the way back needs no sign-in
 * either. 303s back to the page, which now says the digest is on.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const u = form?.get("u");
  const t = form?.get("t");
  const id = linkUser(u, t);
  if (id === null) {
    return new Response("That link is not valid. Turn the digest on at https://p0dcasters.com/account instead.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  await setSubscribed(id, true);
  const qs = new URLSearchParams({ u: String(id), t: String(t) });
  return new Response(null, { status: 303, headers: { location: `/newsletter/unsubscribed?${qs}`, "cache-control": "no-store" } });
}
