import type { Metadata } from "next";
import Link from "next/link";
import Ad from "@/components/Ad";
import Art from "@/components/Art";
import { AD_TEXT } from "@/lib/ads";
import { tv, type Channel } from "@/lib/live/tv";
import { countryName, label } from "@/lib/live/nichedb";
import { jsonLdScript } from "@/lib/jsonld";

// The channel list lives in memory (lib/live), so this renders per request.
export const dynamic = "force-dynamic";

const PER = 60;
const SITE = "https://p0dcasters.com";

type Params = { q?: string; country?: string; category?: string; page?: string };

function clean(p: Params) {
  const country = /^[a-z]{2}$/i.test(p.country || "") ? p.country!.toUpperCase() : undefined;
  const category = (p.category || "").trim().toLowerCase().slice(0, 40) || undefined;
  const q = (p.q || "").trim().slice(0, 80) || undefined;
  const page = Math.min(500, Math.max(1, parseInt(p.page || "1", 10) || 1));
  return { country, category, q, page };
}

function href(p: { country?: string; category?: string; q?: string; page?: number }) {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.country) qs.set("country", p.country.toLowerCase());
  if (p.category) qs.set("category", p.category);
  if (p.page && p.page > 1) qs.set("page", String(p.page));
  const s = qs.toString();
  return s ? `/tv?${s}` : "/tv";
}

function heading(country?: string, category?: string) {
  const c = category ? `${label(category)} ` : "";
  return country ? `${c}TV from ${countryName(country)}` : category ? `${c}TV channels` : "Live TV";
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const { country, category, q, page } = clean(await searchParams);
  const name = heading(country, category);
  return {
    title: country || category ? name : "Live TV channels",
    description: `${name}: free-to-air and public television channels with an open live stream, from the iptv-org directory. Search by name, country and category, and watch in the browser.`,
    alternates: { canonical: href({ country, category }) },
    ...(q || page > 1 ? { robots: { index: false, follow: true } } : {}),
  };
}

function ChannelCard({ c }: { c: Channel }) {
  return (
    <Link className="card" href={`/tv/${encodeURIComponent(c.id)}`}>
      <Art src={c.logo || ""} title={c.name} size={68} />
      <div className="meta">
        <h3>{c.name}</h3>
        <div className="host">{c.cc ? countryName(c.cc) : "International"}</div>
        <div className="sub">
          {c.categories.slice(0, 3).map(label).join(" · ") || "General"}
          {c.quality ? ` · ${c.quality}` : ""}
        </div>
      </div>
    </Link>
  );
}

export default async function Tv({ searchParams }: { searchParams: Promise<Params> }) {
  const { country, category, q, page } = clean(await searchParams);
  const res = await tv({ country, category, q, page, per: PER });
  const pages = Math.ceil(res.total / PER);
  const name = heading(country, category);
  const url = `${SITE}${href({ country, category })}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name,
        description: "Television channels with an open live stream, from the iptv-org directory, playable in the browser.",
        isPartOf: { "@id": `${SITE}/#website` },
        ...(page === 1 && res.rows.length
          ? {
              mainEntity: {
                "@type": "ItemList",
                numberOfItems: res.total,
                itemListElement: res.rows.slice(0, 20).map((c, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  item: {
                    "@type": "TelevisionChannel",
                    name: c.name,
                    url: `${SITE}/tv/${encodeURIComponent(c.id)}`,
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
          { "@type": "ListItem", position: 2, name: "TV", item: `${SITE}/tv` },
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
          <b style={{ color: "var(--text)" }}>{res.total.toLocaleString()}</b> channels with an open
          live stream that plays on this page. The list is the{" "}
          <a href="https://github.com/iptv-org/iptv">iptv-org</a> directory of publicly available
          channels, read through <a href="https://nichedb.dev/c/channels">nichedb.dev</a>. Nothing is
          rebroadcast here: the picture comes straight from each channel&rsquo;s own public stream,
          and a channel that only streams over plain http is left out because a browser will not
          play it on a secure page.
        </p>

        <form className="live-filter" action="/tv">
          <input name="q" defaultValue={q} placeholder="Search channels…" aria-label="Search channels" />
          <select name="country" defaultValue={country?.toLowerCase() || ""} aria-label="Country">
            <option value="">Any country</option>
            {res.countries.map((c) => (
              <option key={c.key} value={c.key.toLowerCase()}>
                {countryName(c.key)} ({c.n.toLocaleString()})
              </option>
            ))}
          </select>
          <select name="category" defaultValue={category || ""} aria-label="Category">
            <option value="">Any category</option>
            {res.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {label(c.key)} ({c.n.toLocaleString()})
              </option>
            ))}
          </select>
          <button type="submit">Find</button>
        </form>

        {!country && !category && !q && res.countries.length > 0 && (
          <>
            <h2 className="sec" style={{ marginTop: 22 }}>
              Categories
            </h2>
            <div className="chips">
              {res.categories.slice(0, 24).map((c) => (
                <Link className="chip" key={c.key} href={href({ category: c.key })}>
                  {label(c.key)} <b>{c.n.toLocaleString()}</b>
                </Link>
              ))}
            </div>
            <h2 className="sec" style={{ marginTop: 22 }}>
              Countries
            </h2>
            <div className="chips">
              {res.countries.slice(0, 24).map((c) => (
                <Link className="chip" key={c.key} href={href({ country: c.key })}>
                  {countryName(c.key)} <b>{c.n.toLocaleString()}</b>
                </Link>
              ))}
            </div>
          </>
        )}
        {(country || category || q) && (
          <p className="small" style={{ marginTop: 14 }}>
            <Link href="/tv">All channels</Link>
          </p>
        )}
      </section>

      <Ad format={AD_TEXT} />

      <section style={{ paddingTop: 10 }}>
        {res.rows.length ? (
          <div className="grid">
            {res.rows.map((c) => (
              <ChannelCard key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <div className="empty">No channel matches that. Try another country, category or name.</div>
        )}
        {pages > 1 && (
          <div className="pager">
            {page > 1 && (
              <Link className="btn" href={href({ country, category, q, page: page - 1 })}>
                ← Previous
              </Link>
            )}
            <span className="small" style={{ alignSelf: "center" }}>
              Page {page} of {pages.toLocaleString()}
            </span>
            {page < pages && (
              <Link className="btn" href={href({ country, category, q, page: page + 1 })}>
                Next →
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
