import { createThrottle } from "@profullstack/throttle";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { gateway } from "@/lib/crawl-gateway";

/**
 * The site-wide allowance: a hundred requests a minute, per caller, on every
 * route. Going over is answered 402 with the crawl gateway's offer, not 429.
 *
 * WHY. The gateway is the only thing in front of this site, and it charges
 * crawlers that say who they are. Nothing charged the ones that do not, and
 * nothing counted anything -- a caller walking every episode page was as
 * unmetered as a reader on one.
 *
 * That is the shape that failed on coinpayportal on 2026-09-08: a headless
 * browser found a route nobody had listed and walked 19,000 of its URLs a day
 * for two days, wearing a plain Chrome user agent, tripping no list. A
 * directory of feeds is exactly the shape a corpus crawl wants.
 *
 * Runs inside the middleware, so nothing here may import Node-only modules.
 */

/** The session cookie's value, as a bucket key rather than a boolean. */
function sessionKey(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE}=`)) {
      return trimmed.slice(SESSION_COOKIE.length + 1) || null;
    }
  }
  return null;
}

export const throttle = createThrottle({
  gateway,
  /*
   * A signed-in listener gets the larger budget rather than the anonymous one.
   * The gateway exempts a session outright -- it is deciding whether to charge
   * a crawler, and a session is good evidence of a person. Here they are still
   * counted, because an unmetered site for anyone willing to sign up first is
   * a worse trade than metering a listener generously.
   */
  credentialFrom: (request) =>
    sessionKey(request) ??
    request.headers.get("x-api-key")?.trim() ??
    /^(\S+)\s+(\S+)/.exec(request.headers.get("authorization")?.trim() ?? "")?.[2] ??
    null,
  credential: { limit: 600, ceiling: 1200 },
  rules: [
    /* Sign-in stays address-bucketed, or a guess buys the listener budget. */
    { path: "/auth/", limit: 10, credential: false },
    { path: "/api/auth/", limit: 10, credential: false },
    /*
     * The machine-readable surfaces stay generous for the same reason they are
     * among the gateway's open paths: they are how an agent uses the directory
     * rather than copies it, and they cost one file to serve.
     */
    { path: "/llms.txt", limit: 600 },
    { path: "/llms-full.txt", limit: 600 },
  ],
});

/** Resolves to a Response for a caller over the allowance, or undefined. */
export const meter = (request: Request) => throttle.handle(request);
