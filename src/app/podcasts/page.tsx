import type { Metadata } from "next";
import Link from "next/link";
import { cachedDb } from "@/lib/cached-db";
import { titleCase, languageName } from "@/lib/format";
import type { Podcast } from "@/lib/db";
import Card from "@/components/Card";
import Ad from "@/components/Ad";
import { AD_TEXT } from "@/lib/ads";
import { listingJsonLd, jsonLdScript } from "@/lib/jsonld";

const { all, count, languageBuckets } = cachedDb(300);

// Rendered per request, not at build: the build must not need the database.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Podcasts",
  description:
    "The podcast directory: every live show with an RSS feed, on any host. Browse by subject, language and network, or search, and listen in the browser.",
  alternates: { canonical: "/podcasts" },
};

/**
 * The front door to the podcast half of the site, now that it shares the
 * header with /radio and /tv. Every show still lives at /podcast/<slug>; this
 * page only points into the catalogue.
 */
export default async function Podcasts() {
  const [total, hosts, featured, cats, langs] = await Promise.all([
    count("SELECT COUNT(*) AS n FROM podcasts"),
    count("SELECT COUNT(DISTINCT host) AS n FROM podcasts"),
    all<Podcast>("SELECT * FROM podcasts ORDER BY score DESC LIMIT 24"),
    all<{ category: string; n: number }>(
      "SELECT category, COUNT(*) AS n FROM podcasts WHERE category IS NOT NULL GROUP BY category ORDER BY n DESC LIMIT 24",
    ),
    languageBuckets(),
  ]);

  return (
    <div className="wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          listingJsonLd({
            path: "/podcasts",
            name: "Podcasts",
            description: `${total.toLocaleString()} live podcasts with an RSS feed, on any host.`,
            crumb: "Podcasts",
            rows: featured,
            page: 1,
          }),
        )}
      />
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Podcasts</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 18px", maxWidth: "68ch" }}>
          <b style={{ color: "var(--text)" }}>{total.toLocaleString()}</b> live shows on{" "}
          {hosts.toLocaleString()} hosts, each read from its own RSS feed. Browse{" "}
          <Link href="/browse">every subject and language</Link>, the{" "}
          <Link href="/networks">networks</Link>, the shows on their own domain under{" "}
          <Link href="/self-hosted">self-hosted</Link>, or the <Link href="/hosts">hosts</Link>{" "}
          themselves. Prefer something live? <Link href="/radio">Radio</Link> and{" "}
          <Link href="/tv">TV</Link> play here too.
        </p>
        <form className="searchbar" action="/search">
          <input name="q" placeholder="Search podcasts…" aria-label="Search podcasts" />
          <button type="submit">Search</button>
        </form>
      </section>

      <section style={{ paddingTop: 0 }}>
        <h2 className="sec">By subject</h2>
        <div className="chips">
          {cats.map((c) => (
            <Link className="chip" key={c.category} href={`/category/${encodeURIComponent(c.category)}`}>
              {titleCase(c.category)} <b>{Number(c.n).toLocaleString()}</b>
            </Link>
          ))}
          <Link className="chip" href="/browse">
            All subjects →
          </Link>
        </div>
        <h2 className="sec" style={{ marginTop: 22 }}>
          By language
        </h2>
        <div className="chips">
          {langs.slice(0, 16).map((l) => (
            <Link className="chip" key={l.code} href={`/language/${l.code}`}>
              {languageName(l.code)} <b>{Number(l.n).toLocaleString()}</b>
            </Link>
          ))}
        </div>
      </section>

      <Ad format={AD_TEXT} />

      <section>
        <h2 className="sec">Deep catalogues, still publishing</h2>
        <div className="grid">
          {featured.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
