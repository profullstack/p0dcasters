import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth/session";
import NewsletterToggle from "@/components/NewsletterToggle";
import { describeSlot, nextSlot, slotFrom } from "@/lib/newsletter";
import { isSubscribed, latestIssue, previewIssue, webCopy } from "@/lib/newsletter-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The weekly digest",
  description:
    "One email a week from p0dcasters: the shows new to the directory, the most followed, and what the big catalogues and networks published.",
  alternates: { canonical: "/newsletter" },
};

// What the digest is, when it goes out, and the latest issue as it was sent
// (or, before the first send, this week's as it would be built now). The
// issue is the mail's own HTML in a sandboxed frame, so the web copy is the
// mail and cannot drift from it.
export default async function Newsletter() {
  const user = await currentUser();
  const slot = slotFrom(process.env);
  const [latest, on] = await Promise.all([
    latestIssue().catch(() => null),
    user ? isSubscribed(user.id).catch(() => true) : Promise.resolve(false),
  ]);
  const issue = latest ?? (await previewIssue().catch(() => null));
  const next = nextSlot(new Date(), slot);

  return (
    <div className="wrap narrow">
      <h1>The weekly digest</h1>
      <p>
        One email a week, {describeSlot(slot)}: the shows that joined the directory, the most
        followed, the long-running shows that published, and the networks that were busiest.
        Every account gets it unless it is turned off, and every issue has a one-click
        unsubscribe link. No ads.
      </p>
      <p className="muted">
        Next issue:{" "}
        {next.toLocaleString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}{" "}
        UTC.
      </p>

      <section className="panel">
        <h2>Your subscription</h2>
        {user ? (
          <NewsletterToggle initial={on} />
        ) : (
          <p>
            The digest goes to p0dcasters accounts. <Link href="/signup">Create one</Link> (an email
            address is the whole account) or <Link href="/login?next=/newsletter">sign in</Link>.
          </p>
        )}
      </section>

      {issue ? (
        <section>
          <h2>{latest ? `Latest issue, ${latest.week}` : "This week's issue so far"}</h2>
          <p className="muted small">{issue.subject}</p>
          <iframe
            className="newsletter-issue"
            title={issue.subject}
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
            srcDoc={webCopy(issue.html).replace("<head>", '<head><base target="_top">')}
          />
        </section>
      ) : null}

      <p className="muted small">
        For scripts and agents: <a href="/api/v1/newsletter">/api/v1/newsletter</a> (schedule and
        latest issue), <a href="/api/v1/newsletter/preview">/api/v1/newsletter/preview</a> (this
        week&rsquo;s issue as it stands), <code>p0d newsletter</code>, and the MCP tools
        get_newsletter and newsletter_preview.
      </p>
    </div>
  );
}
