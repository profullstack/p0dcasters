import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { cachedDb } from "@/lib/cached-db";
import type { Podcast } from "@/lib/db";
import { networkBySlug, networkWhere } from "@/lib/networks";
import Card from "@/components/Card";
import Ad from "@/components/Ad";
import { AD_TEXT } from "@/lib/ads";
import { listingJsonLd, jsonLdScript } from "@/lib/jsonld";
import SortTabs from "@/components/SortTabs";
import { listHref, listSort, sortSql } from "@/lib/sort";

const { all, count } = cachedDb(3600);

// Rendered per request, not at build: the build must not need the database.
export const dynamic = "force-dynamic";
const PER = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const n = networkBySlug(slug);
  if (!n) return {};
  return {
    title: `${n.name} podcasts`,
    description: `Every live ${n.name} podcast, read from its own RSS feed. ${n.description}`,
    alternates: { canonical: `/networks/${n.slug}` },
  };
}

export default async function NetworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const { slug } = await params;
  const { page, sort: sortParam } = await searchParams;
  const sort = listSort(sortParam);
  const by = sortSql(sort, "score DESC, newest_pubdate DESC");
  const n = networkBySlug(slug);
  if (!n) notFound();
  const pg = Math.max(1, parseInt(page || "1", 10) || 1);
  const w = networkWhere(n);

  const total = await count(`SELECT COUNT(*) AS n FROM podcasts WHERE ${w.sql}`, w.params);
  const rows = total
    ? await all<Podcast>(`SELECT * FROM podcasts WHERE (${w.sql})${by.where} ORDER BY ${by.order} LIMIT ? OFFSET ?`, [
        ...w.params,
        ...by.params,
        PER,
        (pg - 1) * PER,
      ])
    : [];
  const pages = Math.ceil(total / PER);

  return (
    <div className="wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          listingJsonLd({
            path: `/networks/${n.slug}`,
            name: `${n.name} podcasts`,
            description: `${total.toLocaleString()} live ${n.name} podcasts.`,
            crumb: n.name,
            rows,
            page: pg,
          }),
        )}
      />
      <section>
        <p style={{ margin: "0 0 6px", fontSize: 14 }}>
          <Link href="/networks">Networks</Link>
        </p>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{n.name}</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 14px", maxWidth: "62ch" }}>
          {n.description} {total.toLocaleString()} live show{total === 1 ? "" : "s"} ·{" "}
          <a href={n.site} rel="noopener">
            {n.site.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        </p>
        {total === 0 && (
          <p>
            No {n.name} show has published inside the last 90 days, so none is listed right now.
          </p>
        )}
        <Ad format={AD_TEXT} />
        <SortTabs path={`/networks/${n.slug}`} sort={sort} />
        <div className="grid">
          {rows.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
        {pages > 1 && (
          <div className="pager">
            {pg > 1 && (
              <Link className="btn" href={listHref(`/networks/${n.slug}`, sort, pg - 1)}>
                ← Previous
              </Link>
            )}
            <span className="btn" style={{ borderColor: "transparent" }}>
              {pg} of {pages}
            </span>
            {pg < pages && (
              <Link className="btn" href={listHref(`/networks/${n.slug}`, sort, pg + 1)}>
                Next →
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
