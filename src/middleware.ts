import { x402Proxy } from "@profullstack/x402-gateway/next";
import { gateway } from "@/lib/crawl-gateway";
import { meter } from "@/lib/throttle";
import type { NextRequest } from "next/server";

// Two things, in this order.
//
// The crawl gateway first. Training crawlers (GPTBot, ClaudeBot, CCBot,
// meta-externalagent, Bytespider, ...) get 402 Payment Required with an x402
// offer, or the sales page at /crawl; a paid pass in `x-crawl-pass` lets them
// through for a day. People, Googlebot and the retrieval crawlers behind AI
// answers are untouched.
//
// Then the site-wide allowance. The gateway charges crawlers that say who they
// are; nothing charged the ones that do not, and nothing counted anything at
// all. 100 requests a minute per caller on every route, and going over is
// answered 402 with the same offer rather than 429 -- so a scraper wearing a
// browser user agent is sold the same pass GPTBot buys. Reasoning in
// lib/throttle.ts.
//
// Returning undefined from either means "carry on" and Next serves the route.
const gate = x402Proxy(gateway);

export async function middleware(request: NextRequest) {
  const answer = await gate(request);
  if (answer) return answer;

  const overLimit = await meter(request);
  if (overLimit) return overLimit;

  return undefined;
}

export const config = {
  // Everything except Next's own assets and static files. Route handlers such
  // as /robots.txt, /llms.txt and /sitemap.xml are deliberately matched: the
  // gateway itself decides which of those a refused crawler may still read,
  // and the throttle needs to see everything a scraper can ask for.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icons/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf)$).*)",
  ],
};
