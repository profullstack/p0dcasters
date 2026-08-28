import { count } from "@/lib/db";

export const revalidate = 86400;
const SITE = "https://p0dcasters.com";
const CHUNK = 5000;

export async function GET() {
  const total = await count("SELECT COUNT(*) AS n FROM podcasts");
  const chunks = Math.max(1, Math.ceil(total / CHUNK));
  const now = new Date().toISOString();
  const urls = [
    `${SITE}/sitemaps/pages.xml`,
    ...Array.from({ length: chunks }, (_, i) => `${SITE}/sitemaps/${i}.xml`),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <sitemap><loc>${u}</loc><lastmod>${now}</lastmod></sitemap>`).join("\n") +
    `\n</sitemapindex>\n`;
  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
