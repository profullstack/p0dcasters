import type { Metadata } from "next";
import { all } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import Card from "@/components/Card";
import Ad from "@/components/Ad";
import AdBanner from "@/components/AdBanner";
import { AD_GRID_SPLIT, AD_TEXT } from "@/lib/ads";
import { tokenise, ftsQuery } from "@/lib/search";

export const metadata: Metadata = {
  title: "Search",
  description: "Search independent, self-hosted podcasts by title, description or domain.",
};

async function search(q: string): Promise<Podcast[]> {
  const tokens = tokenise(q);
  if (!tokens.length) return [];
  const sql = `SELECT p.* FROM podcasts_fts f JOIN podcasts p ON p.id = f.rowid
               WHERE podcasts_fts MATCH ? ORDER BY bm25(podcasts_fts, 8.0, 1.0, 3.0, 4.0) LIMIT 60`;
  // AND first for precision; fall back to OR so a long query still returns something.
  let rows = await all<Podcast>(sql, [ftsQuery(tokens, "AND")]);
  if (!rows.length && tokens.length > 1) {
    rows = await all<Podcast>(sql, [ftsQuery(tokens, "OR")]);
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
              No independent show matches that. The directory only covers self-hosted
              podcasts, so anything exclusive to Spotify or Anchor won't be here.
            </p>
          )}
        </section>
      )}
      <AdBanner />
    </div>
  );
}
