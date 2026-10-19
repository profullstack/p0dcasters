import type { Metadata } from "next";
import { cachedDb } from "@/lib/cached-db";
import Ad from "@/components/Ad";
import { AD_MREC } from "@/lib/ads";
import Link from "next/link";

const { all, count } = cachedDb(86400);

// Rendered per request, not at build: the build must not need the database.
// The reads are memoised for 86400 s (the old ISR window) in lib/cached-db.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "About",
  description: "How p0dcasters decides which podcasts are listed, how hosts and networks are labelled, and how shows are ordered.",
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
            "Any host is fine: a show on its own domain, on Anchor, Buzzsprout, Libsyn or any other hosting platform, or in a network library such as TWiT, NPR or the BBC. Starting from the Podcast Index public database and the networks' own feed lists, a feed is listed when it returned HTTP 200 on the last fetch and published within the last 90 days; has at least three episodes plus a title, description and artwork; and is not a bulk-dump content farm, meaning feeds averaging ten or more episodes a day over their lifetime are left out. Near-identical copies of the same feed are collapsed into one.",
        },
      },
      {
        "@type": "Question",
        name: "How does p0dcasters tell a hosting platform from a show's own domain?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "By measurement: a domain carrying 25 or more live feeds in the Podcast Index is a hosting platform, and its shows are labelled as hosted there. The label decides nothing about whether a show is listed. Shows on a domain below that line are the self-hosted ones, listed together at https://p0dcasters.com/self-hosted.",
        },
      },
      {
        "@type": "Question",
        name: "Why not just rank podcasts by popularity?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Domain popularity does not measure a show: 93% of live feeds sit on a domain in the global top million because they are on the same twenty platforms, so the ranking measures the platform's traffic. It would also bury every show on its own small domain. Shows are ordered by their own catalogue instead.",
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
            "Metadata comes from the Podcast Index, from the networks' own published feed lists, and from publishers who add their show. The full directory is available as OPML at https://p0dcasters.com/opml, which any podcast app can import. Nothing is hosted by p0dcasters: every link points at the publisher.",
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
            "Add it at https://p0dcasters.com/submit: paste the show's site or feed URL, it is read and checked against the inclusion rules at once, and a person lists it after a look, usually the same day; no account needed. Shows in the Podcast Index that meet the rules also appear on their own at the next rebuild. To be removed, or to report wrong metadata, email hello@p0dcasters.com — though titles, descriptions and artwork are read from your feed, so correcting the feed corrects the listing everywhere.",
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
          Podcasting is an open format: an RSS feed at a URL. That holds wherever the feed
          lives — on the creator&rsquo;s own domain, on a hosting platform, or in a
          broadcaster&rsquo;s library. Of the 4.7 million feeds in the Podcast Index, most
          are dead; this directory is the part that is still publishing.
        </p>
        <p>
          That is <strong>{total.toLocaleString()} shows</strong> on{" "}
          <strong>{hosts.toLocaleString()} distinct hosts</strong>, together{" "}
          {Number(eps).toLocaleString()} episodes: shows on their own domain, shows on
          Anchor, Buzzsprout, Libsyn and every other host, and the big libraries with RSS
          — TWiT, NPR, the BBC, CBC, ABC Australia and the rest of the{" "}
          <Link href="/networks">networks</Link>.
        </p>

        <h2 id="what-gets-in">What gets in?</h2>
        <p>
          Any host is fine. Starting from the Podcast Index public database and the
          networks&rsquo; own feed lists, a feed is listed when it:
        </p>
        <ul>
          <li>returned HTTP 200 on the last fetch, and published within the last 90 days;</li>
          <li>has at least three episodes, plus a title, description and artwork;</li>
          <li>
            isn't a bulk-dump content farm — feeds averaging ten or more episodes a day over
            their lifetime are left out.
          </li>
        </ul>
        <p>Near-identical copies of the same feed on one host are collapsed into one.</p>

        <h2 id="hosts">Platforms, networks and self-hosted shows</h2>
        <p>
          Where a show is hosted is a label, not a rule. A domain carrying 25 or more live
          feeds in the Podcast Index is counted as a hosting platform, and its shows say so
          (&ldquo;Hosted on Buzzsprout&rdquo;). The threshold is measured on every rebuild,
          not declared. A show on a domain below it publishes from its own site; those are
          all listed together under <Link href="/self-hosted">self-hosted</Link>, which is
          what this directory started as. The <Link href="/networks">networks</Link> page
          groups the broadcasters and podcast networks that publish their whole library as
          RSS. <Link href="/hosts">Hosts</Link> lists the domains carrying the most shows.
        </p>

        {/* One rectangle, at a section break well into the piece — someone
            still reading here has settled in. */}
        <Ad format={AD_MREC} />

        <h2 id="why-not-popularity">Why not just rank by popularity?</h2>
        <p>
          The obvious move is to rank feeds by how popular their domain is. It doesn't work:
          93% of live feeds sit on a domain in the global top million, because they're on
          the same twenty platforms. That measures the platform's traffic, never the show.
          And the domains <em>absent</em> from those rankings are the shows on their own
          small sites — so ranking that way would bury them under everything else.
        </p>

        <h2 id="ordering">How are shows ordered?</h2>
        <p>
          Shows are ranked by catalogue depth and longevity, weighted by recency — not by
          raw recency alone. Sorting purely by newest episode hands the top of every page to
          whoever publishes most often, which in practice means automated feeds.
        </p>

        <h2 id="data">Where does the data come from?</h2>
        <p>
          Metadata comes from the <a href="https://podcastindex.org">Podcast Index</a>, from
          the networks&rsquo; own published feed lists, and from publishers who{" "}
          <Link href="/submit">add their show</Link>. The
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
          <Link href="/submit">Add it</Link>: paste the show&rsquo;s site or its feed and it is
          read and checked against the rules above at once — a feed that misses a rule is told
          which one. A feed that passes waits for a person to look at it before it is listed,
          usually the same day. Shows in the Podcast Index that meet the rules also appear on
          their own at the next rebuild, with nobody in the loop. To be taken out, or to report metadata that is wrong, write to{" "}
          <Link href="/contact">us</Link> — though titles, descriptions and artwork are read
          from your feed, so fixing the feed fixes it everywhere.
        </p>
      </section>
    </div>
  );
}
