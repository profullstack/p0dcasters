import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { all, count } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import Card from "@/components/Card";
import { languageName } from "@/lib/format";
import Link from "next/link";

export const revalidate = 3600;
const PER = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const name = languageName(lang);
  return {
    title: `${name} podcasts`,
    description: `Independent, self-hosted podcasts in ${name}.`,
    alternates: { canonical: `/language/${lang}` },
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

  const total = await count("SELECT COUNT(*) AS n FROM podcasts WHERE lang_base = ?", [lang]);
  if (!total) notFound();

  const rows = await all<Podcast>(
    "SELECT * FROM podcasts WHERE lang_base = ? ORDER BY score DESC LIMIT ? OFFSET ?",
    [lang, PER, (pg - 1) * PER],
  );
  const pages = Math.ceil(total / PER);

  return (
    <div className="wrap">
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
          {languageName(lang)}
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
              <Link className="btn" href={`/language/${lang}?page=${pg - 1}`}>
                ← Previous
              </Link>
            )}
            <span className="btn" style={{ borderColor: "transparent" }}>
              {pg} of {pages}
            </span>
            {pg < pages && (
              <Link className="btn" href={`/language/${lang}?page=${pg + 1}`}>
                Next →
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
