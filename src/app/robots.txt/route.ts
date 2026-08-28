export const revalidate = 86400;

export async function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /search",
    "",
    "Sitemap: https://p0dcasters.com/sitemap.xml",
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
