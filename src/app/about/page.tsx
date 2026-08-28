import type { Metadata } from "next";
import { all, count } from "@/lib/db";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: "About",
  description: "How p0dcasters decides what counts as an independent podcast.",
  alternates: { canonical: "/about" },
};

export default async function About() {
  const total = await count("SELECT COUNT(*) AS n FROM podcasts");
  const hosts = await count("SELECT COUNT(DISTINCT host) AS n FROM podcasts");
  const [{ eps }] = await all<{ eps: number }>("SELECT SUM(episode_count) AS eps FROM podcasts");

  return (
    <div className="wrap">
      <section className="prose">
        <h1 style={{ fontSize: 31, margin: "0 0 18px", letterSpacing: "-0.02em" }}>
          About p0dcasters
        </h1>
        <p>
          Podcasting was designed as an open format: an RSS feed at a URL you control. Most
          of it no longer works that way. Of the 4.7 million feeds in the Podcast Index,
          roughly 40% sit on a single host — Spotify's Anchor — and the ten largest hosts
          account for about three quarters of everything.
        </p>
        <p>
          This directory is the remainder: <strong>{total.toLocaleString()} shows</strong> on{" "}
          <strong>{hosts.toLocaleString()} distinct domains</strong>, together{" "}
          {Number(eps).toLocaleString()} episodes. Every one publishes from a domain its
          creator controls.
        </p>

        <h2>What gets in</h2>
        <p>Starting from the Podcast Index public database, a feed is listed when it:</p>
        <ul>
          <li>returned HTTP 200 on the last fetch, and published within the last 90 days;</li>
          <li>
            is <em>not</em> on a hosting platform or broadcaster — defined as any domain
            carrying 25 or more live feeds, which removes 308 domains including every major
            host;
          </li>
          <li>has at least three episodes, plus a title, description and artwork;</li>
          <li>
            isn't a bulk-dump content farm — feeds averaging ten or more episodes a day over
            their lifetime are excluded.
          </li>
        </ul>

        <h2>Why not just rank by popularity</h2>
        <p>
          The obvious move is to rank feeds by how popular their domain is. It doesn't work:
          93% of live feeds already sit on a domain in the global top million, because
          they're all on the same twenty platforms. That measures Spotify's traffic, never
          the show. Worse, the domains <em>absent</em> from those rankings are precisely the
          independent ones — so ranking that way buries exactly what's worth finding. It is
          used here inverted, as one signal for identifying platforms to exclude.
        </p>

        <h2>Ordering</h2>
        <p>
          Shows are ranked by catalogue depth and longevity, weighted by recency — not by
          raw recency alone. Sorting purely by newest episode hands the top of every page to
          whoever publishes most often, which in practice means automated feeds.
        </p>

        <h2>Data</h2>
        <p>
          Metadata comes from the <a href="https://podcastindex.org">Podcast Index</a>. The
          full directory is available as <a href="/opml">OPML</a>, which any podcast app can
          import. Nothing here is hosted by us: every link points at the publisher.
        </p>
      </section>
    </div>
  );
}
