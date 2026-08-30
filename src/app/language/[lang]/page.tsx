import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { all, count, one, languageVariants } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import Card from "@/components/Card";
import Ad from "@/components/Ad";
import AdBanner from "@/components/AdBanner";
import { AD_GRID_SPLIT, AD_TEXT } from "@/lib/ads";
import { languageName, normalizeLang, safeDecode } from "@/lib/format";
import { listingJsonLd, jsonLdScript } from "@/lib/jsonld";
import Link from "next/link";
import TimeAgo from "@/components/TimeAgo";

export const revalidate = 3600;
const PER = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const code = normalizeLang(safeDecode(lang));
  const name = languageName(code ?? safeDecode(lang));
  return {
    title: `${name} podcasts`,
    description: `Independent, self-hosted podcasts in ${name}. Every show publishes from a domain its creator controls.`,
    // The canonical is the normalised code, so the variant spellings that all
    // resolve here consolidate onto one URL.
    alternates: { canonical: `/language/${code ?? lang}` },
  };
}

export default async function Language({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { lang } = await params;
  const { page } = await searchParams;
  const pg = Math.max(1, parseInt(page || "1", 10) || 1);

  // One language, one URL. Anything that resolves to a code but isn't spelled
  // like it — /language/eng, /language/en_US, an old link to /language/franç —
  // moves to the canonical page rather than serving a duplicate of it.
  // Decoded first: route params arrive percent-encoded, so the accented and
  // space-bearing values the directory used to link at would never match.
  const code = normalizeLang(safeDecode(lang));
  if (!code) notFound();
  if (code !== lang) permanentRedirect(`/language/${code}`);

  // The directory still holds the publisher's own spelling, so match every
  // variant of this language rather than the canonical code alone.
  const variants = await languageVariants(code);
  if (variants.length === 0) notFound();
  const holes = variants.map(() => "?").join(",");

  const total = await count(
    `SELECT COUNT(*) AS n FROM podcasts WHERE lang_base IN (${holes})`,
    variants,
  );
  if (!total) notFound();

  // Same thin-page problem as the category listings, same fix: numbers taken
  // from this language's own rows rather than a sentence with the name swapped.
  const facts = await one<{ domains: number; eps: number; newest: number }>(
    `SELECT COUNT(DISTINCT host) AS domains, SUM(episode_count) AS eps, MAX(newest_pubdate) AS newest
     FROM podcasts WHERE lang_base IN (${holes})`,
    variants,
  );

  const rows = await all<Podcast>(
    `SELECT * FROM podcasts WHERE lang_base IN (${holes}) ORDER BY score DESC LIMIT ? OFFSET ?`,
    [...variants, PER, (pg - 1) * PER],
  );
  const pages = Math.ceil(total / PER);

  // Same shape as a category listing — see there for why the break goes
  // between two grids rather than inside one.
  const split = rows.length > AD_GRID_SPLIT + 3 ? AD_GRID_SPLIT : 0;

  return (
    <div className="wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          listingJsonLd({
            path: `/language/${code}`,
            name: `${languageName(code)} podcasts`,
            description: `${total.toLocaleString()} independent, self-hosted podcasts in ${languageName(code)}.`,
            crumb: languageName(code),
            rows,
            page: pg,
          }),
        )}
      />
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
          {languageName(code)}
        </h1>
        <p style={{ color: "var(--muted)", margin: "0 0 14px" }}>
          {total.toLocaleString()} independent shows
        </p>
        {pg === 1 && (
        <div className="blurb">
          <p>
            Independent podcasts published in {languageName(code)}, each from a domain its
            own creator controls. Feeds on Spotify&rsquo;s Anchor, Buzzsprout, Libsyn and the
            other large hosts are excluded from the directory, so this is the self-hosted
            part of {languageName(code)} podcasting rather than a chart of it.
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
              The language is the one the publisher declares in their own feed, folded onto
              its ISO 639-1 code — so <code>eng</code>, <code>en_US</code> and{" "}
              <code>English</code> all land here.
            </li>
            <li>
              Nothing is hosted here: each card links to the show, and the show links to its
              publisher. <Link href="/browse">Every language, with counts</Link>.
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
              <Link className="btn" href={`/language/${code}?page=${pg - 1}`}>
                ← Previous
              </Link>
            )}
            <span className="btn" style={{ borderColor: "transparent" }}>
              {pg} of {pages}
            </span>
            {pg < pages && (
              <Link className="btn" href={`/language/${code}?page=${pg + 1}`}>
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
