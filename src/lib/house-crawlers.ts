/**
 * House crawlers that read the profile routes at a directory's pace.
 *
 * nichedb.dev pulls every podcaster's OpenProfile.md into its people
 * collection (nichedb.dev/c/profiles). It says who it is in its user agent,
 * and it only wants two things: the listing and the files the listing names.
 * Under the anonymous allowance (a hundred requests a minute, then a 402 with
 * the crawl offer) a backfill of a hundred thousand shows takes days; under
 * the reader budget it takes hours.
 *
 * So a request that names a house crawler AND asks for one of the two profile
 * routes is metered as a credentialed caller: the throttle's credential budget
 * (600 a minute, with the per-address ceiling above it) rather than the
 * anonymous one. Every other route, and every other caller, is unchanged. The
 * claim costs nothing to make and buys nothing outside these two routes, so a
 * stranger wearing the string gains only what a signed-in listener already has,
 * on the two cheapest routes on the site.
 *
 * Pure: no imports, so the middleware and a test can both read it.
 */

/** User agent prefixes of the house crawlers, as they identify themselves. */
export const HOUSE_CRAWLERS = ["niche-db/"] as const;

/** The routes the budget applies to, and nothing else. */
export const PROFILE_ROUTES = [/^\/api\/openprofiles$/, /^\/podcast\/[^/]+\/openprofile\.md$/] as const;

/** The user agent's crawler name when it is a house crawler, else null. */
export function houseCrawler(userAgent: string | null | undefined): string | null {
  const ua = (userAgent ?? "").trim();
  for (const prefix of HOUSE_CRAWLERS) {
    if (ua.startsWith(prefix)) return prefix.replace(/\/$/, "");
  }
  return null;
}

/** True when the path is one of the two profile routes. */
export function isProfileRoute(pathname: string): boolean {
  return PROFILE_ROUTES.some((re) => re.test(pathname));
}

/**
 * The credential a house crawler earns on a profile route, as a bucket key
 * for the throttle, or null when this request gets no special budget.
 */
export function houseCrawlerCredential(request: Request): string | null {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return null;
  }
  if (!isProfileRoute(pathname)) return null;
  const name = houseCrawler(request.headers.get("user-agent"));
  return name ? `crawler:${name}` : null;
}
