/*
 * Ad inventory.
 *
 * One CrawlProof slot serves the whole directory; what varies by position is
 * the *format*, and each format has a job:
 *
 *   text_link       native, ~40px, full width. Reads as a line of the page, so
 *                   it is the only unit allowed above content — it never
 *                   displaces a heading or pushes the shows below the fold.
 *   banner_300x250  the medium rectangle. It is a box, so it only goes where a
 *                   reader has already stopped and where the column is a
 *                   column: partway down a show page, or a section break in
 *                   the about text. Never inside .grid — the cards there are
 *                   about 100px tall and a 266px cell forces the whole grid row
 *                   to match it, leaving two card-shaped holes alongside.
 *   banner_728x90   leaderboard, wide screens only.
 *   banner_320x50   the same job on a phone. Picked at runtime by <AdBanner>,
 *                   never by rendering both and hiding one — a hidden unit
 *                   still fills, and burns an impression nobody sees.
 *
 * The slot also advertises `terminal_ascii` and `feed_item`. ad.js has no
 * renderer for either in a browser, so both are deliberately unused here.
 *
 * Deliberately *not* monetised: /opml, /sitemap.xml, /robots.txt and /api/* —
 * the machine-readable surface has no viewport to put an ad in.
 */

export const AD_SLOT = "250db6de-f91a-4c9e-802c-0ce68901067e";

export const AD_MREC = "banner_300x250";
export const AD_TEXT = "text_link";

/**
 * Where to break a card grid for a unit.
 *
 * Four rows of three. Far enough in that a reader has started scanning shows
 * rather than deciding whether to, and short of the fold on nothing but a very
 * tall window.
 */
export const AD_GRID_SPLIT = 12;

/**
 * Decide where units go inside a long list, and in what format.
 *
 * Two rules do the work. A short list gets nothing — a page with a dozen rows
 * on it cannot carry an in-feed ad without the ad becoming the page. And the
 * count is capped, so a 300-row listing never turns into a column of ads.
 *
 * @param total how many items the list is about to render
 * @param opts `first` is the index to place after, counting from 0; `every` is
 *   the gap between units thereafter.
 * @returns item index → format to render after that item
 */
export function adPlan(
  total: number,
  {
    first,
    every,
    max = 2,
    formats = [AD_TEXT],
  }: { first: number; every: number; max?: number; formats?: string[] },
): Map<number, string> {
  const plan = new Map<number, string>();

  // Nothing to interleave unless there is a real run of content below the first
  // slot — otherwise the "in-feed" unit is really just a footer ad.
  if (total <= first + 1) return plan;

  for (let i = first, n = 0; i < total - 1 && n < max; i += every, n += 1) {
    plan.set(i, formats[n % formats.length]);
  }

  return plan;
}
