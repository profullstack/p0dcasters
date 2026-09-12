import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { all, count, one } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import Card from "@/components/Card";
import Ad from "@/components/Ad";
import AdBanner from "@/components/AdBanner";
import { AD_GRID_SPLIT, AD_TEXT } from "@/lib/ads";
import { titleCase } from "@/lib/format";
import { listingJsonLd, jsonLdScript } from "@/lib/jsonld";
import Link from "next/link";
import TimeAgo from "@/components/TimeAgo";

export const revalidate = 3600;
const PER = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const name = titleCase(decodeURIComponent(category));
  return {
    title: `${name} podcasts`,
    description: `Independent, self-hosted ${name.toLowerCase()} podcasts — every show publishes from its own domain.`,
    alternates: { canonical: `/category/${category}` },
  };
}

export default async function Category({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { category } = await params;
  const { page } = await searchParams;
  const cat = decodeURIComponent(category);
  const pg = Math.max(1, parseInt(page || "1", 10) || 1);

  const total = await count("SELECT COUNT(*) AS n FROM podcasts WHERE category = ?", [cat]);
  if (!total) notFound();

  // A category page used to be a heading, a count and a grid of artwork: under
  // 80 words, most of it show titles. That is a thin page by any measure, and
  // there are forty of them. These three numbers are the page's own data, so
  // the prose below differs per category instead of being one sentence with
  // the noun swapped out.
  const facts = await one<{ domains: number; eps: number; newest: number }>(
    `SELECT COUNT(DISTINCT host) AS domains, SUM(episode_count) AS eps, MAX(newest_pubdate) AS newest
     FROM podcasts WHERE category = ?`,
    [cat],
  );

  const rows = await all<Podcast>(
    "SELECT * FROM podcasts WHERE category = ? ORDER BY score DESC LIMIT ? OFFSET ?",
    [cat, PER, (pg - 1) * PER],
  );
  const pages = Math.ceil(total / PER);

  // The break falls between two runs of cards rather than inside one, so the
  // unit sits in its own full-width band and cannot distort a grid row.
  const split = rows.length > AD_GRID_SPLIT + 3 ? AD_GRID_SPLIT : 0;

  return (
    <div className="wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          listingJsonLd({
            path: `/category/${category}`,
            name: `${titleCase(cat)} podcasts`,
            description: `${total.toLocaleString()} independent, self-hosted ${cat} podcasts — every show publishes from a domain its creator controls.`,
            crumb: titleCase(cat),
            rows,
            page: pg,
          }),
        )}
      />
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
          {titleCase(cat)}
        </h1>
        <p style={{ color: "var(--muted)", margin: "0 0 14px" }}>
          {total.toLocaleString()} independent shows
        </p>
        {pg === 1 && (
        <div className="blurb">
          <p>
            Every {cat.toLowerCase()} podcast here publishes from a domain its own creator
            controls. None of them sits on Spotify&rsquo;s Anchor, Buzzsprout, Libsyn or any
            other large host: those domains are excluded from the directory by construction,
            so this is the self-hosted remainder of the subject rather than a ranking of it.
          </p>
          <ul>
            <li>
              <strong>{total.toLocaleString()}</strong> show{total === 1 ? "" : "s"}, across{" "}
              <strong>{Number(facts?.domains || 0).toLocaleString()}</strong> distinct
              domain{Number(facts?.domains) === 1 ? "" : "s"}.
            </li>
            <li>
              <strong>{Number(facts?.eps || 0).toLocaleString()}</strong> episodes between
              them, newest{" "}
              {facts?.newest ? <TimeAgo unix={facts.newest} /> : <>unknown</>}.
            </li>
            <li>
              Ordered by catalogue depth and longevity weighted by recency — not by raw
              recency, and not by popularity. <Link href="/about">Why, and what gets in</Link>.
            </li>
            <li>
              Nothing is hosted here: each card links to the show, and the show links to its
              publisher. <Link href="/opml">Take the whole directory as OPML</Link>.
            </li>
          </ul>
        </div>
        )}
        <Ad format={AD_TEXT} />
        <div className="grid">
          {(split ? rows.slice(0, split) : rows).map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
        {split > 0 && (
          <>
            <Ad format={AD_TEXT} />
            <div className="grid">
              {rows.slice(split).map((p) => (
                <Card key={p.id} p={p} />
              ))}
            </div>
          </>
        )}
        {pages > 1 && (
          <div className="pager">
            {pg > 1 && (
              <Link className="btn" href={`/category/${category}?page=${pg - 1}`}>
                ← Previous
              </Link>
            )}
            <span className="btn" style={{ borderColor: "transparent" }}>
              {pg} of {pages}
            </span>
            {pg < pages && (
              <Link className="btn" href={`/category/${category}?page=${pg + 1}`}>
                Next →
              </Link>
            )}
          </div>
        )}
        <AdBanner />
      </section>
    </div>
  );
}
