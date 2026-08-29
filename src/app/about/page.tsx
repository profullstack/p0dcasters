import type { Metadata } from "next";
import { all, count } from "@/lib/db";
import Ad from "@/components/Ad";
import AdBanner from "@/components/AdBanner";
import { AD_MREC } from "@/lib/ads";
import Link from "next/link";

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

  // Mirrors the visible sections below — same questions, same answers. Kept in
  // step with them by hand; if a section's wording changes, change it here too.
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": "https://p0dcasters.com/about#faq",
    isPartOf: { "@id": "https://p0dcasters.com/#website" },
    mainEntity: [
      {
        "@type": "Question",
        name: "What gets a podcast into p0dcasters?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Starting from the Podcast Index public database, a feed is listed when it returned HTTP 200 on the last fetch and published within the last 90 days; is not on a hosting platform or broadcaster, defined as any domain carrying 25 or more live feeds, which removes 308 domains including every major host; has at least three episodes plus a title, description and artwork; and is not a bulk-dump content farm, meaning feeds averaging ten or more episodes a day over their lifetime are excluded.",
        },
      },
      {
        "@type": "Question",
        name: "Why not just rank podcasts by popularity?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "It does not work: 93% of live feeds already sit on a domain in the global top million, because they are all on the same twenty platforms. That measures Spotify's traffic, never the show. Worse, the domains absent from those rankings are precisely the independent ones, so ranking that way buries exactly what is worth finding. Popularity is used here inverted, as one signal for identifying platforms to exclude.",
        },
      },
      {
        "@type": "Question",
        name: "How are shows ordered?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Shows are ranked by catalogue depth and longevity, weighted by recency, rather than by raw recency alone. Sorting purely by newest episode hands the top of every page to whoever publishes most often, which in practice means automated feeds.",
        },
      },
      {
        "@type": "Question",
        name: "Where does p0dcasters get its data?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Metadata comes from the Podcast Index. The full directory is available as OPML at https://p0dcasters.com/opml, which any podcast app can import. Nothing is hosted by p0dcasters: every link points at the publisher.",
        },
      },
      {
        "@type": "Question",
        name: "What does p0dcasters cost?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Nothing, and there is no paid tier. An account is free and optional: it exists so you can follow shows and keep that list across devices, and it stores an email address and a list of show slugs. You can browse, search, play and export the whole directory without one.",
        },
      },
      {
        "@type": "Question",
        name: "How do I get my podcast listed on p0dcasters, or removed from it?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Listing is automatic and there is no submission form, because nobody approves entries by hand. If your feed is in the Podcast Index and meets the inclusion rules, it appears at the next rebuild. To be removed, or to report wrong metadata, email hello@p0dcasters.com — though titles, descriptions and artwork are read from your feed, so correcting the feed corrects the listing everywhere.",
        },
      },
    ],
  };

  return (
    <div className="wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
      />
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

        <h2 id="what-gets-in">What gets in?</h2>
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

        {/* One rectangle, at a section break well into the piece — someone
            still reading here has settled in. */}
        <Ad format={AD_MREC} />

        <h2 id="why-not-popularity">Why not just rank by popularity?</h2>
        <p>
          The obvious move is to rank feeds by how popular their domain is. It doesn't work:
          93% of live feeds already sit on a domain in the global top million, because
          they're all on the same twenty platforms. That measures Spotify's traffic, never
          the show. Worse, the domains <em>absent</em> from those rankings are precisely the
          independent ones — so ranking that way buries exactly what's worth finding. It is
          used here inverted, as one signal for identifying platforms to exclude.
        </p>

        <h2 id="ordering">How are shows ordered?</h2>
        <p>
          Shows are ranked by catalogue depth and longevity, weighted by recency — not by
          raw recency alone. Sorting purely by newest episode hands the top of every page to
          whoever publishes most often, which in practice means automated feeds.
        </p>

        <h2 id="data">Where does the data come from?</h2>
        <p>
          Metadata comes from the <a href="https://podcastindex.org">Podcast Index</a>. The
          full directory is available as <a href="/opml">OPML</a>, which any podcast app can
          import. Nothing here is hosted by us: every link points at the publisher.
        </p>

        <h2 id="cost">What does it cost?</h2>
        <p>
          Nothing, and there is no paid tier to upgrade to. An{" "}
          <Link href="/signup">account</Link> is free and optional: it exists so you can
          follow shows and keep that list across devices, and it stores an email address
          and a list of slugs — see <Link href="/privacy">privacy</Link>. You can browse,
          search, play and export the whole directory without one.
        </p>

        <h2 id="get-listed">How do I get my show listed, or removed?</h2>
        <p>
          Listing is automatic: there is no submission form because nobody approves entries
          by hand. If your feed is in the Podcast Index and meets the rules above, it
          appears at the next rebuild. To be taken out, or to report metadata that is
          wrong, write to <Link href="/contact">us</Link> — though titles, descriptions and
          artwork are read from your feed, so fixing the feed fixes it everywhere.
        </p>
      </section>
      <AdBanner />
    </div>
  );
}
