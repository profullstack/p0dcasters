import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { all, one } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import Card from "@/components/Card";
import Art from "@/components/Art";
import Ad from "@/components/Ad";
import AdBanner from "@/components/AdBanner";
import { AD_MREC } from "@/lib/ads";
import FollowButton from "@/components/FollowButton";
import { LatestButton, ShowEpisodes } from "@/components/ShowEpisodes";
import { cadence, languageName, titleCase, clamp, safeImage, normalizeLang } from "@/lib/format";
import TimeAgo from "@/components/TimeAgo";

export const revalidate = 3600;

async function get(slug: string) {
  return one<Podcast>("SELECT * FROM podcasts WHERE slug = ?", [slug]);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await get(slug);
  if (!p) return { title: "Not found" };
  const desc = clamp(p.description, 180);
  return {
    title: p.title,
    description: desc,
    alternates: { canonical: `/podcast/${p.slug}` },
    openGraph: {
      type: "website",
      title: p.title,
      description: desc,
      // https only — an http card image is dropped by every scraper that
      // fetches it from an https page.
      images: safeImage(p.image_url) ? [{ url: safeImage(p.image_url) }] : undefined,
    },
    // Overrides the layout's summary_large_image. Podcast artwork is square, and
    // a large card is 1.91:1 — X crops the top and bottom off it. A summary card
    // shows the square uncropped beside the title. twitter.images stays unset so
    // it keeps falling back to the openGraph image above.
    twitter: { card: "summary" },
  };
}

export default async function Show({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await get(slug);
  if (!p) notFound();

  const more = await all<Podcast>(
    `SELECT * FROM podcasts WHERE category IS ? AND id <> ? ORDER BY score DESC LIMIT 6`,
    [p.category, p.id],
  );
  const sameHost = await all<Podcast>(
    `SELECT * FROM podcasts WHERE host = ? AND id <> ? ORDER BY score DESC LIMIT 6`,
    [p.host, p.id],
  );

  const cats = (p.categories || "").split(",").filter(Boolean);
  const site = p.link || `https://${p.host}`;
  const rate = cadence(p.per_week);
  // The player's track travels to a client component too, so upgrade it here
  // rather than leaving an http:// URL in the serialised payload.
  const show = { slug: p.slug, title: p.title, image: safeImage(p.image_url) };

  const url = `https://p0dcasters.com/podcast/${p.slug}`;
  const art = safeImage(p.image_url);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "PodcastSeries",
        "@id": `${url}#series`,
        name: p.title,
        description: clamp(p.description, 500),
        ...(art ? { image: art } : {}),
        url,
        webFeed: p.feed_url,
        numberOfEpisodes: Number(p.episode_count) || undefined,
        // The publisher's newest episode, which is the only defensible
        // "last updated" for a page that is a view of their feed.
        ...(p.newest_pubdate
          ? { dateModified: new Date(p.newest_pubdate * 1000).toISOString() }
          : {}),
        inLanguage: normalizeLang(p.lang_base ?? p.language) ?? undefined,
        ...(p.category ? { genre: titleCase(p.category) } : {}),
        ...(p.author ? { author: { "@type": "Person", name: p.author } } : {}),
        // The show is published on the creator's own domain — that is the whole
        // premise of the directory, so say so rather than implying we host it.
        publisher: { "@type": "Organization", name: p.author || p.host, url: site },
        isPartOf: { "@id": "https://p0dcasters.com/#website" },
      },
      // Where this page sits, so a result can be shown in context rather than
      // as a bare URL.
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "p0dcasters", item: "https://p0dcasters.com/" },
          ...(p.category
            ? [{
                "@type": "ListItem",
                position: 2,
                name: titleCase(p.category),
                item: `https://p0dcasters.com/category/${encodeURIComponent(p.category)}`,
              }]
            : []),
          { "@type": "ListItem", position: p.category ? 3 : 2, name: p.title, item: url },
        ],
      },
    ],
  };

  return (
    <div className="wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="show">
        <div>
          <Art className="art" src={art} title={p.title} size={200} />
        </div>
        <div>
          <h1>{p.title}</h1>
          <p className="byline">
            {p.author ? `${p.author} · ` : ""}
            <a href={site} rel="noopener nofollow">
              {p.host}
            </a>
          </p>
          <p className="desc">{p.description}</p>

          <div className="facts">
            <div>
              <b>{Number(p.episode_count).toLocaleString()}</b> episodes
            </div>
            <div>
              <b>
                <TimeAgo unix={p.newest_pubdate} />
              </b>{" "}
              latest
            </div>
            {rate && (
              <div>
                <b>{rate}</b> cadence
              </div>
            )}
            <div>
              <b>{languageName(p.lang_base)}</b> language
            </div>
            {p.explicit ? (
              <div>
                <b>Explicit</b> rating
              </div>
            ) : null}
          </div>

          <div className="actions">
            <Suspense fallback={<span className="btn primary ghosted">▶ Play latest</span>}>
              <LatestButton feedUrl={p.feed_url} show={show} />
            </Suspense>
            <FollowButton slug={p.slug} />
            <a className="btn" href={p.feed_url} rel="noopener nofollow">
              RSS feed
            </a>
            <a className="btn" href={site} rel="noopener nofollow">
              Website
            </a>
            {cats.map((c) => (
              <Link className="btn" key={c} href={`/category/${encodeURIComponent(c)}`}>
                {titleCase(c)}
              </Link>
            ))}
          </div>

          <div className="feedurl">{p.feed_url}</div>
        </div>
      </div>

      <section>
        <Suspense
          fallback={
            <>
              <h2 className="sec">Episodes</h2>
              <p className="muted">Reading the feed…</p>
            </>
          }
        >
          <ShowEpisodes feedUrl={p.feed_url} show={show} />
        </Suspense>
      </section>

      {/* Below the episode list: a reader who has scrolled this far has stopped
          to look at something, which is the only condition under which a
          rectangle is worth its space. Nothing above it — the play button, the
          follow button and the feed URL are what this page is for. */}
      <Ad format={AD_MREC} />

      {sameHost.length > 0 && (
        <section>
          <h2 className="sec">Also on {p.host}</h2>
          <div className="grid">
            {sameHost.map((x) => (
              <Card key={x.id} p={x} />
            ))}
          </div>
        </section>
      )}

      {more.length > 0 && (
        <section>
          <h2 className="sec">
            More {p.category ? titleCase(p.category) : "independent"} shows
          </h2>
          <div className="grid">
            {more.map((x) => (
              <Card key={x.id} p={x} />
            ))}
          </div>
        </section>
      )}

      <AdBanner />
    </div>
  );
}
