import type { Metadata } from "next";
import Link from "next/link";
import Ad from "@/components/Ad";
import Art from "@/components/Art";
import StationPlay from "@/components/live/StationPlay";
import { AD_TEXT } from "@/lib/ads";
import { titleCase } from "@/lib/format";
import { radio, type Station } from "@/lib/live/radio";
import { countryName } from "@/lib/live/nichedb";
import { jsonLdScript } from "@/lib/jsonld";

// The station list lives in memory (lib/live), so this renders per request.
export const dynamic = "force-dynamic";

const PER = 60;
const SITE = "https://p0dcasters.com";

type Params = { q?: string; country?: string; genre?: string; page?: string };

function clean(p: Params) {
  const country = /^[a-z]{2}$/i.test(p.country || "") ? p.country!.toUpperCase() : undefined;
  const genre = (p.genre || "").trim().toLowerCase().slice(0, 40) || undefined;
  const q = (p.q || "").trim().slice(0, 80) || undefined;
  const page = Math.min(500, Math.max(1, parseInt(p.page || "1", 10) || 1));
  return { country, genre, q, page };
}

function href(p: { country?: string; genre?: string; q?: string; page?: number }) {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.country) qs.set("country", p.country.toLowerCase());
  if (p.genre) qs.set("genre", p.genre);
  if (p.page && p.page > 1) qs.set("page", String(p.page));
  const s = qs.toString();
  return s ? `/radio?${s}` : "/radio";
}

function heading(country?: string, genre?: string) {
  const g = genre ? `${titleCase(genre)} ` : "";
  return country ? `${g}radio from ${countryName(country)}` : genre ? `${g}radio` : "Live radio";
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const { country, genre, q, page } = clean(await searchParams);
  const name = heading(country, genre);
  return {
    title: country || genre ? `${name} stations` : "Live radio stations",
    description: `${name}: internet radio stations streaming now, from the community directory at radio-browser.info. Search by name, country and genre, and listen in the browser.`,
    // A filtered list is a real page; a search or a later page is not one to index.
    alternates: { canonical: href({ country, genre }) },
    ...(q || page > 1 ? { robots: { index: false, follow: true } } : {}),
  };
}

function StationCard({ s }: { s: Station }) {
  const where = [s.state, s.country].filter(Boolean).join(", ");
  return (
    <div className="card live-card">
      <Art src={s.logo || ""} title={s.name} size={68} />
      <div className="meta">
        <h3>{s.name}</h3>
        <div className="host">{where || "Internet radio"}</div>
        <div className="sub">
          {s.genres.slice(0, 3).map(titleCase).join(" · ") || "Radio"}
          {s.bitrate ? ` · ${s.bitrate} kbps` : ""}
          {s.home && (
            <>
              {" · "}
              <a href={s.home} rel="nofollow noopener" target="_blank">
                Website
              </a>
            </>
          )}
        </div>
      </div>
      <StationPlay
        station={{ id: `radio:${s.id}`, title: s.name, audio: s.stream, image: s.logo, country: s.country || "" }}
      />
    </div>
  );
}

export default async function Radio({ searchParams }: { searchParams: Promise<Params> }) {
  const { country, genre, q, page } = clean(await searchParams);
  const res = await radio({ country, genre, q, page, per: PER });
  const pages = Math.ceil(res.total / PER);
  const name = heading(country, genre);
  const url = `${SITE}${href({ country, genre })}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name: `${name} stations`,
        description: "Internet radio stations streaming now, from radio-browser.info, playable in the browser.",
        isPartOf: { "@id": `${SITE}/#website` },
        ...(page === 1 && res.rows.length
          ? {
              mainEntity: {
                "@type": "ItemList",
                numberOfItems: res.total,
                itemListElement: res.rows.slice(0, 20).map((s, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  item: {
                    "@type": "RadioStation",
                    name: s.name,
                    ...(s.home ? { url: s.home } : {}),
                    ...(s.logo ? { logo: s.logo } : {}),
                    ...(s.country ? { address: { "@type": "PostalAddress", addressCountry: s.cc || s.country } } : {}),
                  },
                })),
              },
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "p0dcasters", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Radio", item: `${SITE}/radio` },
        ],
      },
    ],
  };

  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(jsonLd)} />
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{name}</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 18px", maxWidth: "68ch" }}>
          {res.complete ? (
            <>
              <b style={{ color: "var(--text)" }}>{res.total.toLocaleString()}</b> stations streaming
              now
            </>
          ) : (
            <>Stations streaming now</>
          )}
          , most listened first. Press play and keep browsing: a station plays in the same dock as a
          podcast episode. Listings come from the community directory at{" "}
          <a href="https://www.radio-browser.info/">radio-browser.info</a>, read through{" "}
          <a href="https://nichedb.dev/c/radio">nichedb.dev</a>; only stations with a secure stream
          that plays on this page are shown.
        </p>

        <form className="live-filter" action="/radio">
          <input name="q" defaultValue={q} placeholder="Search stations…" aria-label="Search stations" />
          <select name="country" defaultValue={country?.toLowerCase() || ""} aria-label="Country">
            <option value="">Any country</option>
            {res.countries.slice(0, 120).map((c) => (
              <option key={c.key} value={c.key.toLowerCase()}>
                {countryName(c.key)} ({c.n.toLocaleString()})
              </option>
            ))}
          </select>
          <select name="genre" defaultValue={genre || ""} aria-label="Genre">
            <option value="">Any genre</option>
            {res.genres.slice(0, 120).map((g) => (
              <option key={g.key} value={g.key}>
                {titleCase(g.key)} ({g.n.toLocaleString()})
              </option>
            ))}
          </select>
          <button type="submit">Find</button>
        </form>

        {!country && !genre && !q && res.countries.length > 0 && (
          <>
            <h2 className="sec" style={{ marginTop: 22 }}>
              Countries
            </h2>
            <div className="chips">
              {res.countries.slice(0, 18).map((c) => (
                <Link className="chip" key={c.key} href={href({ country: c.key })}>
                  {countryName(c.key)} <b>{c.n.toLocaleString()}</b>
                </Link>
              ))}
            </div>
            <h2 className="sec" style={{ marginTop: 22 }}>
              Genres
            </h2>
            <div className="chips">
              {res.genres.slice(0, 24).map((g) => (
                <Link className="chip" key={g.key} href={href({ genre: g.key })}>
                  {titleCase(g.key)} <b>{g.n.toLocaleString()}</b>
                </Link>
              ))}
            </div>
          </>
        )}
        {(country || genre || q) && (
          <p className="small" style={{ marginTop: 14 }}>
            <Link href="/radio">All stations</Link>
          </p>
        )}
      </section>

      <Ad format={AD_TEXT} />

      <section style={{ paddingTop: 10 }}>
        {res.rows.length ? (
          <div className="grid">
            {res.rows.map((s) => (
              <StationCard key={s.id} s={s} />
            ))}
          </div>
        ) : (
          <div className="empty">No station matches that. Try another country, genre or name.</div>
        )}
        {res.complete && pages > 1 && (
          <div className="pager">
            {page > 1 && (
              <Link className="btn" href={href({ country, genre, q, page: page - 1 })}>
                ← Previous
              </Link>
            )}
            <span className="small" style={{ alignSelf: "center" }}>
              Page {page} of {pages.toLocaleString()}
            </span>
            {page < pages && (
              <Link className="btn" href={href({ country, genre, q, page: page + 1 })}>
                Next →
              </Link>
            )}
          </div>
        )}
        {!res.complete && res.rows.length === PER && (
          <div className="pager">
            <Link className="btn" href={href({ country, genre, q, page: page + 1 })}>
              More →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
