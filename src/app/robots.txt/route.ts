import { robotsRoute } from "@profullstack/x402-gateway/next";
import { gateway } from "@/lib/crawl-gateway";

export const revalidate = 86400;

// Two kinds of AI crawler visit this site and only one of them ever sends a
// listener back. Retrieval crawlers (OAI-SearchBot, Claude-SearchBot,
// PerplexityBot, Applebot, Amazonbot, DuckAssistBot, ...) feed the live index
// that AI answers cite from, and a citation is a link to a show page: they are
// welcome everywhere a reader may go, and named here so their operators can
// see that. Training crawlers (GPTBot, ClaudeBot, CCBot, meta-externalagent,
// Bytespider, Applebot-Extended, cohere-ai, ...) copy pages into a corpus that
// is baked into weights months later and cites nothing back, and Meta's alone
// was a third of last week's hits. Those get `Disallow: /` plus `Allow: /crawl`,
// where the gateway in src/middleware.ts sells them a day of access instead.
//
// Every named group repeats the wildcard rules, because a crawler that finds
// its own name obeys that group alone and ignores `User-agent: *`. The lists
// live in src/lib/crawl-gateway.ts so robots.txt and the 402s cannot disagree.
export const GET = robotsRoute(gateway, {
  disallow: [
    // Generated per query, duplicates the category and language pages, and is
    // effectively infinite. /browse and /opml are the crawlable equivalents.
    "/search",
    // Signed-in surfaces. Nothing here renders for a crawler anyway.
    "/account",
    "/following",
    "/api/",
  ],
});
