import type { Metadata } from "next";
import Link from "next/link";
import { cachedDb } from "@/lib/cached-db";
import type { Podcast } from "@/lib/db";
import { NETWORK_HOSTS } from "@/lib/networks";
import Card from "@/components/Card";
import Ad from "@/components/Ad";
import AdBanner from "@/components/AdBanner";
import { AD_TEXT } from "@/lib/ads";
import { listingJsonLd, jsonLdScript } from "@/lib/jsonld";

const { all, count } = cachedDb(3600);

// Rendered per request, not at build: the build must not need the database.
export const dynamic = "force-dynamic";
const PER = 60;

export const metadata: Metadata = {
  title: "Self-hosted podcasts",
  description:
    "Podcasts published from a domain their creator controls — not a hosting platform, not a network.",
  alternates: { canonical: "/self-hosted" },
};

// What this directory used to be in full: a show is self-hosted when its feed
// host is neither a hosting platform (25+ live feeds, `platform_hosts`) nor a
// network's own domain.
const NET = NETWORK_HOSTS.length ? ` AND host NOT IN (${NETWORK_HOSTS.map(() => "?").join(",")})` : "";
const WHERE = `host NOT IN (SELECT host FROM platform_hosts)${NET}`;

export default async function SelfHosted({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const pg = Math.max(1, parseInt(page || "1", 10) || 1);
  const [total, domains] = await Promise.all([
    count(`SELECT COUNT(*) AS n FROM podcasts WHERE ${WHERE}`, NETWORK_HOSTS),
    count(`SELECT COUNT(DISTINCT host) AS n FROM podcasts WHERE ${WHERE}`, NETWORK_HOSTS),
  ]);
  const rows = await all<Podcast>(`SELECT * FROM podcasts WHERE ${WHERE} ORDER BY score DESC LIMIT ? OFFSET ?`, [
    ...NETWORK_HOSTS,
    PER,
    (pg - 1) * PER,
  ]);
  const pages = Math.ceil(total / PER);

  return (
    <div className="wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          listingJsonLd({
            path: "/self-hosted",
            name: "Self-hosted podcasts",
            description: `${total.toLocaleString()} live podcasts published from their creator's own domain.`,
            crumb: "Self-hosted",
            rows,
            page: pg,
          }),
        )}
      />
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Self-hosted</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 14px", maxWidth: "62ch" }}>
          {total.toLocaleString()} shows on {domains.toLocaleString()} domains, each published
          from a domain its creator controls. A host carrying 25 or more live feeds counts as a
          hosting platform and a network&rsquo;s own domain counts as the network, so neither is
          here. <Link href="/about">How that is measured</Link>.
        </p>
        <Ad format={AD_TEXT} />
        <div className="grid">
          {rows.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
        {pages > 1 && (
          <div className="pager">
            {pg > 1 && (
              <Link className="btn" href={`/self-hosted?page=${pg - 1}`}>
                ← Previous
              </Link>
            )}
            <span className="btn" style={{ borderColor: "transparent" }}>
              {pg} of {pages}
            </span>
            {pg < pages && (
              <Link className="btn" href={`/self-hosted?page=${pg + 1}`}>
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
