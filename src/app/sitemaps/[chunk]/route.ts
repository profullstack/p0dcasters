import { all, languageBuckets } from "@/lib/db";

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
    // Normalised codes, not raw lang_base: the directory holds spellings like
    // " en " and "franç", and sitemapping those was submitting URLs that 404.
    const langs = await languageBuckets();
    // /search is deliberately absent — robots.txt disallows it, and a sitemap
    // that submits a disallowed URL is asking for a coverage error.
    const statics = ["", "/browse", "/hosts", "/about", "/privacy", "/terms", "/contact"];
    return wrap([
      ...statics.map((p) => `  <url><loc>${SITE}${p}</loc><priority>0.9</priority></url>`),
      // Percent-encoded, not just XML-escaped: two categories are two words
      // ("self improvement", "true crime") and a raw space in a <loc> is not a
      // URL the sitemap spec accepts.
      ...cats.map((c) => `  <url><loc>${SITE}/category/${esc(encodeURIComponent(c.category))}</loc><priority>0.7</priority></url>`),
      ...langs.map((l) => `  <url><loc>${SITE}/language/${esc(l.code)}</loc><priority>0.6</priority></url>`),
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
