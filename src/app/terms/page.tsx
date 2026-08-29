import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: "Terms",
  description:
    "p0dcasters is free to use and hosts nothing. What that means for listeners, and for publishers who want in or out.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <div className="wrap">
      <section className="prose">
        <h1 style={{ fontSize: 31, margin: "0 0 18px", letterSpacing: "-0.02em" }}>Terms</h1>
        <p>
          p0dcasters is a free index of podcasts that publish from their own domains. There
          is no paid tier, no subscription and nothing to buy. An account is optional and
          costs nothing; it exists so you can follow shows and keep that list across
          devices.
        </p>

        <h2>What is and isn&rsquo;t hosted here</h2>
        <p>
          Nothing here is hosted by us. Every listing points at a feed on the publisher&rsquo;s
          own domain, and the artwork and audio you see and hear are fetched from that
          domain directly. The shows, their episodes and their artwork belong to the people
          who made them, and their own terms govern them. Directory metadata comes from the{" "}
          <a href="https://podcastindex.org">Podcast Index</a>.
        </p>

        <h2>Using the directory</h2>
        <p>
          Browse it, search it, and take the whole thing as <Link href="/opml">OPML</Link> —
          that export exists precisely so the list is yours to leave with. Please do not
          hammer the site with automated traffic heavy enough to degrade it for anyone
          else; the OPML export and the{" "}
          <Link href="/sitemap.xml">sitemap</Link> are there so you do not have to scrape.
        </p>

        <h2>Publishers</h2>
        <p>
          Listing is automatic and follows the rules on the{" "}
          <Link href="/about">about page</Link> — nobody submits a show and nobody is paid
          to be included. If your show is here and you would rather it were not, say so and
          it comes out. If it should be here and isn&rsquo;t, the about page explains which
          rule it is missing, and if that looks like a mistake on our side, tell us. Either
          way: <Link href="/contact">contact</Link>.
        </p>

        <h2>No warranty</h2>
        <p>
          The directory is provided as is. Feed metadata is refreshed from an upstream
          source and can be stale, wrong, or missing; a publisher&rsquo;s site can go down or
          change without notice. Nothing here is a recommendation or an endorsement of any
          show&rsquo;s content.
        </p>

        <h2>Changes</h2>
        <p>Last updated 29 August 2026.</p>
      </section>
    </div>
  );
}
