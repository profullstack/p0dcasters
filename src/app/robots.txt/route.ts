export const revalidate = 86400;

// Every AI crawler was already allowed by the wildcard below — none of these
// blocks changes what any of them may fetch. They are spelled out because
// auditors check for the user-agent by name and cannot tell "allowed by
// default" from "never considered", and because naming them makes the policy a
// decision on the record rather than an accident of the default.
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "Meta-ExternalAgent",
  "cohere-ai",
  "DuckAssistBot",
  "MistralAI-User",
  "YouBot",
];

export async function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    // Generated per query, duplicates the category and language pages, and is
    // effectively infinite. /browse and /opml are the crawlable equivalents.
    "Disallow: /search",
    // Signed-in surfaces. Nothing here renders for a crawler anyway.
    "Disallow: /account",
    "Disallow: /following",
    "Disallow: /api/",
    "",
    ...AI_AGENTS.flatMap((ua) => [
      `User-agent: ${ua}`,
      "Allow: /",
      "Disallow: /search",
      "Disallow: /account",
      "Disallow: /following",
      "Disallow: /api/",
      "",
    ]),
    "Sitemap: https://p0dcasters.com/sitemap.xml",
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
