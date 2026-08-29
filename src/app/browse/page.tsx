import type { Metadata } from "next";
import { all, languageBuckets } from "@/lib/db";
import { titleCase, languageName } from "@/lib/format";
import Ad from "@/components/Ad";
import AdBanner from "@/components/AdBanner";
import { AD_TEXT } from "@/lib/ads";
import Link from "next/link";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Browse",
  description: "Browse independent, self-hosted podcasts by subject and language.",
  alternates: { canonical: "/browse" },
};

export default async function Browse() {
  const cats = await all<{ category: string; n: number }>(
    "SELECT category, COUNT(*) AS n FROM podcasts WHERE category IS NOT NULL GROUP BY category ORDER BY n DESC",
  );
  const langs = await languageBuckets();
  return (
    <div className="wrap">
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 22px", letterSpacing: "-0.02em" }}>Browse</h1>
        <h2 className="sec">Subjects</h2>
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
      {/* Between the two chip walls — the natural break on this page, and the
          one place a unit is not competing with a heading. */}
      <Ad format={AD_TEXT} />
      <section>
        <h2 className="sec">Languages</h2>
        <div className="chips">
          {langs.map((l) => (
            <Link className="chip" key={l.code} href={`/language/${l.code}`}>
              {languageName(l.code)} <b>{Number(l.n).toLocaleString()}</b>
            </Link>
          ))}
        </div>
      </section>
      <AdBanner />
    </div>
  );
}
