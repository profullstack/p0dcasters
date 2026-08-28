import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { all, count } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import Card from "@/components/Card";
import { titleCase } from "@/lib/format";

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

  const rows = await all<Podcast>(
    "SELECT * FROM podcasts WHERE category = ? ORDER BY score DESC LIMIT ? OFFSET ?",
    [cat, PER, (pg - 1) * PER],
  );
  const pages = Math.ceil(total / PER);

  return (
    <div className="wrap">
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
          {titleCase(cat)}
        </h1>
        <p style={{ color: "var(--muted)", margin: "0 0 22px" }}>
          {total.toLocaleString()} independent shows
        </p>
        <div className="grid">
          {rows.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
        {pages > 1 && (
          <div className="pager">
            {pg > 1 && (
              <a className="btn" href={`/category/${category}?page=${pg - 1}`}>
                ← Previous
              </a>
            )}
            <span className="btn" style={{ borderColor: "transparent" }}>
              {pg} of {pages}
            </span>
            {pg < pages && (
              <a className="btn" href={`/category/${category}?page=${pg + 1}`}>
                Next →
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
