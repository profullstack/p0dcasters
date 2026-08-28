import type { Metadata } from "next";
import { all } from "@/lib/db";
import { titleCase, languageName } from "@/lib/format";
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
  const langs = await all<{ lang_base: string; n: number }>(
    "SELECT lang_base, COUNT(*) AS n FROM podcasts WHERE lang_base IS NOT NULL GROUP BY lang_base ORDER BY n DESC",
  );
  return (
    <div className="wrap">
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 22px", letterSpacing: "-0.02em" }}>Browse</h1>
        <h2 className="sec">Subjects</h2>
        <div className="chips">
          {cats.map((c) => (
            <Link className="chip" key={c.category} href={`/category/${c.category}`}>
              {titleCase(c.category)} <b>{Number(c.n).toLocaleString()}</b>
            </Link>
          ))}
        </div>
      </section>
      <section>
        <h2 className="sec">Languages</h2>
        <div className="chips">
          {langs.map((l) => (
            <Link className="chip" key={l.lang_base} href={`/language/${l.lang_base}`}>
              {languageName(l.lang_base)} <b>{Number(l.n).toLocaleString()}</b>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
