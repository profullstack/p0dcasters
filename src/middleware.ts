import { x402Proxy } from "@profullstack/x402-gateway/next";
import { gateway } from "@/lib/crawl-gateway";

// The crawl gateway is the only middleware. Training crawlers (GPTBot, ClaudeBot,
// CCBot, meta-externalagent, Bytespider, ...) get 402 Payment Required with an
// x402 offer, or the sales page at /crawl; a paid pass in `x-crawl-pass` lets
// them through for a day. People, Googlebot and the retrieval crawlers behind
// AI answers are untouched: the gateway returns undefined and Next carries on.
//
// If another middleware is ever needed, compose it here with the gateway
// first: `const answer = await gate(request); if (answer) return answer;`.
export const middleware = x402Proxy(gateway);

export const config = {
  // Everything except Next's own assets and static files. Route handlers such
  // as /robots.txt, /llms.txt and /sitemap.xml are deliberately matched: the
  // gateway itself decides which of those a refused crawler may still read.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icons/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf)$).*)",
  ],
};
