import { createGateway } from "@profullstack/x402-gateway";
import { RETRIEVAL_AGENTS, TRAINING_AGENTS } from "@profullstack/x402-gateway/agents";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

// This module is imported by the middleware, which runs in the edge runtime:
// nothing here may import node:, and nothing from src/lib that does (db.ts,
// auth/crypto.ts) either. The gateway itself is Web Crypto + fetch only.

// Next inlines `process.env.FOO` at build time, so a literal lookup freezes
// (and usually drops) the value into the build output. Read through a variable
// key to keep it a real runtime lookup — same reason as src/lib/db.ts.
function env(key: string): string | undefined {
  return process.env[key];
}

// Who pays and who reads free. The library's lists are the documented pairs
// (GPTBot / OAI-SearchBot, ClaudeBot / Claude-SearchBot, meta-externalagent /
// Meta-ExternalFetcher, Applebot-Extended / Applebot). The extras below are the
// agents the old hand-written robots.txt named that the library does not, kept
// on the record so an auditor grepping for them still finds a decision.
export const TRAINING = [...TRAINING_AGENTS, "cohere-ai"];
export const RETRIEVAL = [
  ...RETRIEVAL_AGENTS,
  "Applebot",
  "Amazonbot",
  "DuckAssistBot",
  "MistralAI-User",
  "YouBot",
];

// OVH's VPS fleet, measured on rssamplifier 2026-08-28: vps-*.vps.ovh.net hosts
// wearing "Chrome/148" and fetching every page. Hosting ranges serve no
// readers, only machines, so these are answered with a tiny 403 before
// anything else runs. The gateway reads the address from the LAST hop of
// x-forwarded-for (the one Railway's proxy appends), so a client cannot step
// around this by seeding the header.
const OVH_VPS_RANGES = [
  "51.38.0.0/16",
  "54.38.0.0/16",
  "141.94.0.0/16",
  "145.239.0.0/16",
  "149.202.0.0/16",
  "151.80.0.0/16",
  "57.129.0.0/16",
  "213.32.0.0/16",
];

// A signed-in reader is never charged, whatever their client looks like. Only
// the cookie's presence is checked here: verifying it needs the database, which
// the edge runtime cannot reach, and a made-up cookie buys nothing but a page
// render the session check then refuses.
function signedIn(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").some((c) => c.trim().startsWith(`${SESSION_COOKIE}=`));
}

// Sells a day of crawl access to training crawlers over x402, settled by
// CoinPay in USDC. Without COINPAY_X402_KEY and CRAWL_PAY_TO the gateway still
// answers training crawlers 402, but with an empty offer and a page that says
// payments are off: nothing is sold, and nothing is given away either.
export const gateway = createGateway({
  siteUrl: "https://p0dcasters.com",
  siteName: "p0dcasters",
  coinpay: { apiKey: env("COINPAY_X402_KEY") },
  payTo: env("CRAWL_PAY_TO"),
  contact: "mailto:hello@p0dcasters.com",
  // A refused crawler may still read the map of the site, so the refusal is
  // legible to it rather than a wall. robots.txt and /crawl are always open.
  openPaths: ["/llms.txt", "/skill.md"],
  training: TRAINING,
  retrieval: RETRIEVAL,
  denyCidrs: OVH_VPS_RANGES,
  // A request that says "Chrome/…" but sends no Sec-Fetch-Mode is an HTTP
  // client with a copied string: every Chromium since 76 sends that header on
  // every request and nothing can strip it. Charged like GPTBot. A crawler
  // that declares itself (Googlebot's evergreen string claims Chrome too) is
  // judged by the lists above, never by this.
  chargeSpoofedBrowsers: true,
  exempt: signedIn,
});
