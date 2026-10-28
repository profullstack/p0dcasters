import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Ad from "@/components/Ad";
import TvPlayer from "@/components/live/TvPlayer";
import { AD_TEXT } from "@/lib/ads";
import { safeDecode } from "@/lib/format";
import { channel } from "@/lib/live/tv";
import { countryName, label } from "@/lib/live/nichedb";
import { jsonLdScript } from "@/lib/jsonld";

export const dynamic = "force-dynamic";

const SITE = "https://p0dcasters.com";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await channel(safeDecode(id));
  if (!c) return { title: "Channel not found", robots: { index: false } };
  const where = c.cc ? ` from ${countryName(c.cc)}` : "";
  return {
    title: `${c.name} live`,
    description: `Watch ${c.name}${where} live in the browser: ${
      c.categories.map(label).join(", ") || "television"
    }, from the channel's own public stream.`,
    alternates: { canonical: `/tv/${encodeURIComponent(c.id)}` },
    openGraph: c.logo ? { images: [c.logo] } : undefined,
  };
}

export default async function TvChannel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await channel(safeDecode(id));
  if (!c) notFound();
  const url = `${SITE}/tv/${encodeURIComponent(c.id)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TelevisionChannel",
        "@id": `${url}#channel`,
        name: c.name,
        url,
        broadcastChannelId: c.id,
        broadcastServiceTier: "Free",
        ...(c.categories.length ? { genre: c.categories.map(label) } : {}),
        providesBroadcastService: {
          "@type": "BroadcastService",
          name: c.name,
          ...(c.logo ? { logo: c.logo } : {}),
          ...(c.website ? { sameAs: c.website } : {}),
          ...(c.cc ? { areaServed: { "@type": "Country", name: countryName(c.cc) } } : {}),
          ...(c.langs.length ? { inLanguage: c.langs } : {}),
          ...(c.network ? { parentService: { "@type": "BroadcastService", name: c.network } } : {}),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "p0dcasters", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "TV", item: `${SITE}/tv` },
          { "@type": "ListItem", position: 3, name: c.name, item: url },
        ],
      },
    ],
  };

  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(jsonLd)} />
      <section>
        <p className="small" style={{ margin: "0 0 10px" }}>
          <Link href="/tv">TV</Link>
          {c.cc && (
            <>
              {" › "}
              <Link href={`/tv?country=${c.cc.toLowerCase()}`}>{countryName(c.cc)}</Link>
            </>
          )}
        </p>
        <h1 style={{ fontSize: 30, margin: "0 0 14px", letterSpacing: "-0.02em" }}>{c.name}</h1>
        <TvPlayer streams={[c.stream, ...c.alts]} poster={c.logo} name={c.name} />
        <div className="facts" style={{ marginTop: 18 }}>
          {c.cc && (
            <div>
              <b>{countryName(c.cc)}</b>Country
            </div>
          )}
          {c.categories.length > 0 && (
            <div>
              <b>{c.categories.map(label).join(", ")}</b>Category
            </div>
          )}
          {c.quality && (
            <div>
              <b>{c.quality}</b>Quality
            </div>
          )}
          {(c.network || c.owners.length > 0) && (
            <div>
              <b>{c.network || c.owners.join(", ")}</b>
              {c.network ? "Network" : "Owner"}
            </div>
          )}
        </div>
        <p className="small" style={{ color: "var(--muted)", maxWidth: "68ch" }}>
          The picture comes straight from the channel&rsquo;s public stream as listed by{" "}
          <a href="https://github.com/iptv-org/iptv">iptv-org</a>; p0dcasters does not host or relay
          it. Streams come and go, and a geo-restricted one may not play where you are.
          {c.website && (
            <>
              {" "}
              <a href={c.website} rel="nofollow noopener" target="_blank">
                The channel&rsquo;s website
              </a>
              .
            </>
          )}
        </p>
        <Ad format={AD_TEXT} />
        {c.categories[0] && (
          <p style={{ marginTop: 18 }}>
            More <Link href={`/tv?category=${encodeURIComponent(c.categories[0])}`}>{label(c.categories[0])} channels</Link>
            {c.cc && (
              <>
                {" "}
                or everything <Link href={`/tv?country=${c.cc.toLowerCase()}`}>from {countryName(c.cc)}</Link>
              </>
            )}
            .
          </p>
        )}
      </section>
    </div>
  );
}
