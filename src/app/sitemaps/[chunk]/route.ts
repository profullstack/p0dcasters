import { all } from "@/lib/db";

export const revalidate = 86400;
const SITE = "https://p0dcasters.com";
const CHUNK = 5000;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function wrap(entries: string[]) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`,
    { headers: { "content-type": "application/xml; charset=utf-8" } },
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chunk: string }> },
) {
  const { chunk } = await params;
  const name = chunk.replace(/\.xml$/, "");

  if (name === "pages") {
    const cats = await all<{ category: string }>(
      "SELECT DISTINCT category FROM podcasts WHERE category IS NOT NULL",
    );
    const langs = await all<{ lang_base: string }>(
      "SELECT DISTINCT lang_base FROM podcasts WHERE lang_base IS NOT NULL",
    );
    const statics = ["", "/browse", "/search", "/hosts", "/about"];
    return wrap([
      ...statics.map((p) => `  <url><loc>${SITE}${p}</loc><priority>0.9</priority></url>`),
      ...cats.map((c) => `  <url><loc>${SITE}/category/${esc(c.category)}</loc><priority>0.7</priority></url>`),
      ...langs.map((l) => `  <url><loc>${SITE}/language/${esc(l.lang_base)}</loc><priority>0.6</priority></url>`),
    ]);
  }

  const n = parseInt(name, 10);
  if (!Number.isFinite(n) || n < 0) return new Response("Not found", { status: 404 });

  const rows = await all<{ slug: string; newest_pubdate: number }>(
    "SELECT slug, newest_pubdate FROM podcasts ORDER BY id LIMIT ? OFFSET ?",
    [CHUNK, n * CHUNK],
  );
  if (!rows.length) return new Response("Not found", { status: 404 });

  return wrap(
    rows.map(
      (r) =>
        `  <url><loc>${SITE}/podcast/${esc(r.slug)}</loc><lastmod>${new Date(
          Number(r.newest_pubdate) * 1000,
        ).toISOString()}</lastmod></url>`,
    ),
  );
}
