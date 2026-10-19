import type { Metadata } from "next";
import { all } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import Card from "@/components/Card";
import Ad from "@/components/Ad";
import { AD_GRID_SPLIT, AD_TEXT } from "@/lib/ads";
import { tokenise, ftsQuery, SEARCH_WHERE, SEARCH_ORDER } from "@/lib/search";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Search",
  description: "Search every live podcast with an RSS feed, on any host, by title, description or domain.",
};

async function search(q: string): Promise<Podcast[]> {
  const tokens = tokenise(q);
  if (!tokens.length) return [];
  const sql = `SELECT p.* FROM podcasts p WHERE ${SEARCH_WHERE} ORDER BY ${SEARCH_ORDER} LIMIT 60`;
  // AND first for precision; fall back to OR so a long query still returns something.
  const and = ftsQuery(tokens, "AND");
  let rows = await all<Podcast>(sql, [and, and]);
  if (!rows.length && tokens.length > 1) {
    const or = ftsQuery(tokens, "OR");
    rows = await all<Podcast>(sql, [or, or]);
  }
  return rows;
}

export default async function Search({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q || "").trim();
  const results = query ? await search(query) : [];

  // Only once a search has actually returned a run of shows. An empty search
  // page is a form, and a form is not a place to sell anything.
  const split = results.length > AD_GRID_SPLIT + 3 ? AD_GRID_SPLIT : 0;

  return (
    <div className="wrap">
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 18px", letterSpacing: "-0.02em" }}>
          Search
        </h1>
        <form className="searchbar" action="/search" style={{ maxWidth: 560 }}>
          <input
            name="q"
            defaultValue={query}
            placeholder="Try: linux, sermons, jazz, bookbinding…"
            aria-label="Search podcasts"
          />
          <button type="submit">Search</button>
        </form>
        {/* A query's results carry their own units; the empty page gets one,
            under the input rather than as the last thing above the footer. */}
        {!query && <Ad format={AD_TEXT} />}
        {/* With no query this page was a heading and an input — 62 words, the
            thinnest page on the site. It is disallowed in robots.txt and so
            never indexed, but a person who lands on it with nothing typed
            deserves to be told what they are searching and where else to go. */}
        {!query && (
          <div className="blurb" style={{ marginTop: 22 }}>
            <p>
              Searching titles, descriptions and domains across the directory — every live
              podcast with an RSS feed, on its own domain, on a hosting platform or in a
              network&rsquo;s library. A show that has not published in 90 days is not here.
            </p>
            <ul>
              <li>
                Search by subject (<code>bookbinding</code>), by domain (
                <code>stevefarrar.com</code>), or by a phrase from a show&rsquo;s own
                description.
              </li>
              <li>
                Prefer browsing? <Link href="/browse">Every subject and language</Link>, or{" "}
                <Link href="/hosts">the domains publishing the most</Link>.
              </li>
              <li>
                Taking the data rather than reading it?{" "}
                <Link href="/opml">The whole directory as OPML</Link> is one file and one
                request.
              </li>
            </ul>
          </div>
        )}
      </section>

      {query && (
        <section>
          <h2 className="sec">
            {results.length
              ? `${results.length}${results.length === 60 ? "+" : ""} results for “${query}”`
              : `Nothing found for “${query}”`}
          </h2>
          {results.length ? (
            <>
              <Ad format={AD_TEXT} />
              <div className="grid">
                {(split ? results.slice(0, split) : results).map((p) => (
                  <Card key={p.id} p={p} />
                ))}
              </div>
              {split > 0 && (
                <>
                  <Ad format={AD_TEXT} />
                  <div className="grid">
                    {results.slice(split).map((p) => (
                      <Card key={p.id} p={p} />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="empty">
              No show matches that. The directory lists shows that publish an RSS feed and
              have an episode inside the last 90 days, so a show exclusive to one app, or one
              that has stopped publishing, won&rsquo;t be here.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
