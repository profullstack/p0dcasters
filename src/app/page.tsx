import type { Metadata } from "next";
import { all, count, languageBuckets } from "@/lib/db";
import { timeAgo, titleCase, languageName, clamp, safeImage } from "@/lib/format";
import type { Podcast } from "@/lib/db";
import Card from "@/components/Card";
import Art from "@/components/Art";
import Ad from "@/components/Ad";
import AdBanner from "@/components/AdBanner";
import { AD_TEXT } from "@/lib/ads";
import Link from "next/link";

export const revalidate = 300;

// The one page that had no canonical of its own. Everything else sets one in
// its generateMetadata, so "/" was the only URL with nothing pinning it.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

type CatRow = { category: string; n: number };

export default async function Home() {
  const [total, hosts, featured, fresh, cats, langs] = await Promise.all([
    count("SELECT COUNT(*) AS n FROM podcasts"),
    count("SELECT COUNT(DISTINCT host) AS n FROM podcasts"),
    all<Podcast>("SELECT * FROM podcasts ORDER BY score DESC LIMIT 12"),
    all<Podcast>(
      "SELECT * FROM podcasts WHERE episode_count >= 8 ORDER BY newest_pubdate DESC LIMIT 10",
    ),
    all<CatRow>(
      "SELECT category, COUNT(*) AS n FROM podcasts WHERE category IS NOT NULL GROUP BY category ORDER BY n DESC LIMIT 18",
    ),
    languageBuckets(),
  ]);
  const topLangs = langs.slice(0, 12);

  return (
    <>
      <div className="hero">
        <div className="wrap">
          <h1>Podcasts that live on their own domain.</h1>
          <p className="lede">
            Every one of these <span className="count">{total.toLocaleString()}</span>{" "}
            shows publishes from a domain it controls — not Spotify, not Anchor, not
            Buzzsprout. This is what's left of podcasting's open web.
          </p>
          <form className="searchbar" action="/search">
            <input
              name="q"
              placeholder="Search 22,000 independent shows…"
              aria-label="Search podcasts"
            />
            <button type="submit">Search</button>
          </form>
          <div className="stats">
            <div>
              <b>{total.toLocaleString()}</b> shows
            </div>
            <div>
              <b>{hosts.toLocaleString()}</b> distinct domains
            </div>
            <div>
              <b>0</b> on a big platform
            </div>
          </div>
        </div>
      </div>

      {/* A text link, not a banner: it is the only format that can sit between
          the hero and the first row of shows without pushing them down. */}
      <div className="wrap">
        <Ad format={AD_TEXT} />
      </div>

      <section className="wrap">
        <h2 className="sec">Deep catalogues, still publishing</h2>
        <div className="grid">
          {featured.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
      </section>

      <section className="wrap">
        <h2 className="sec">Published this week</h2>
        <div className="rows">
          {fresh.map((p) => (
            <Link className="row" key={p.id} href={`/podcast/${p.slug}`}>
              <Art src={safeImage(p.image_url)} title={p.title} size={52} />
              <div style={{ minWidth: 0 }}>
                <p className="t">{clamp(p.title, 64)}</p>
                <p className="s">{p.host}</p>
              </div>
              <span className="n">{timeAgo(p.newest_pubdate)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap">
        <h2 className="sec">By subject</h2>
        <div className="chips">
          {cats.map((c) => (
            <Link
              className="chip"
              key={c.category}
              // Encoded: "self improvement" and "true crime" carry a space.
              href={`/category/${encodeURIComponent(c.category)}`}
            >
              {titleCase(c.category)} <b>{Number(c.n).toLocaleString()}</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap">
        <h2 className="sec">By language</h2>
        <div className="chips">
          {topLangs.map((l) => (
            <Link className="chip" key={l.code} href={`/language/${l.code}`}>
              {languageName(l.code)} <b>{Number(l.n).toLocaleString()}</b>
            </Link>
          ))}
        </div>
      </section>

      <div className="wrap">
        <AdBanner />
      </div>
    </>
  );
}
