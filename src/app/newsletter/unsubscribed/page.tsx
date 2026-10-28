import type { Metadata } from "next";
import Link from "next/link";
import { isSubscribed, linkUser } from "@/lib/newsletter-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Weekly digest",
  robots: { index: false },
};

// Where the unsubscribe link lands (after GET /newsletter/unsubscribe has done
// the unsubscribing) and where the Re-subscribe button comes back to. It shows
// the account's current state, so a reload or a second click tells the truth.
export default async function Unsubscribed({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const u = typeof params.u === "string" ? params.u : "";
  const t = typeof params.t === "string" ? params.t : "";
  const id = linkUser(u, t);
  if (id === null) {
    return (
      <div className="wrap narrow">
        <h1>That link is not valid</h1>
        <p className="muted">
          Turn the weekly digest on or off from <Link href="/account">your account</Link> instead.
        </p>
      </div>
    );
  }
  const on = await isSubscribed(id);
  return (
    <div className="wrap narrow">
      {on ? (
        <>
          <h1>You&rsquo;re subscribed again</h1>
          <p className="muted">The weekly digest will be back in your inbox with the next issue.</p>
          <p>
            <a className="btn" href={`/newsletter/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`}>
              Unsubscribe
            </a>
          </p>
        </>
      ) : (
        <>
          <h1>You&rsquo;re unsubscribed</h1>
          <p className="muted">No more weekly digest. Your account and the shows you follow are untouched.</p>
          <form action="/newsletter/resubscribe" method="post">
            <input type="hidden" name="u" value={u} />
            <input type="hidden" name="t" value={t} />
            <button className="btn primary" type="submit">
              Re-subscribe
            </button>
          </form>
        </>
      )}
      <p className="muted small" style={{ marginTop: 28 }}>
        <Link href="/newsletter">About the digest</Link> · <Link href="/account">Account settings</Link>
      </p>
    </div>
  );
}
