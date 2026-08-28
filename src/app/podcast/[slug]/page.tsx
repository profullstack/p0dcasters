import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { all, one } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import Card from "@/components/Card";
import Art from "@/components/Art";
import { timeAgo, cadence, languageName, titleCase, clamp } from "@/lib/format";

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
      images: [{ url: p.image_url }],
    },
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "PodcastSeries",
    name: p.title,
    description: clamp(p.description, 500),
    image: p.image_url,
    url: `https://p0dcasters.com/podcast/${p.slug}`,
    webFeed: p.feed_url,
    inLanguage: p.language || undefined,
    ...(p.author ? { author: { "@type": "Person", name: p.author } } : {}),
  };

  return (
    <div className="wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="show">
        <div>
          <Art className="art" src={p.image_url} title={p.title} />
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
              <b>{timeAgo(p.newest_pubdate)}</b> latest
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
            <a className="btn primary" href={p.feed_url} rel="noopener nofollow">
              RSS feed
            </a>
            <a className="btn" href={site} rel="noopener nofollow">
              Website
            </a>
            {p.latest_audio && (
              <a className="btn" href={p.latest_audio} rel="noopener nofollow">
                Latest episode
              </a>
            )}
            {cats.map((c) => (
              <a className="btn" key={c} href={`/category/${c}`}>
                {titleCase(c)}
              </a>
            ))}
          </div>

          <div className="feedurl">{p.feed_url}</div>
        </div>
      </div>

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
    </div>
  );
}
