/**
 * How a listing is ordered: "popular" (the score, the default) or "recent"
 * (newest episode first). Every section page takes it as ?sort=recent, so a
 * reader can see what just came out in one category, language or network
 * rather than only on the home page.
 */

export type ListSort = "popular" | "recent";

export function listSort(raw: string | string[] | undefined): ListSort {
  return raw === "recent" ? "recent" : "popular";
}

/**
 * A show whose newest episode is dated more than a day ahead (one scheduled for
 * next month, or a feed that stamps next year on everything) would otherwise sit
 * on top of "recent" until that date. It still lists under "popular"; it joins
 * "recent" when the date arrives. A day of slack covers clock skew.
 */
export const FUTURE_SLACK_SECONDS = 86_400;

export function recentCeiling(now = Date.now()): number {
  return Math.floor(now / 1000) + FUTURE_SLACK_SECONDS;
}

/**
 * The extra WHERE and ORDER BY for a sort. Recent walks the newest_pubdate
 * index; popular keeps the score order each page already used, plus whatever
 * tiebreak the page passes.
 */
export function sortSql(sort: ListSort, popularOrder = "score DESC"): { where: string; order: string; params: number[] } {
  return sort === "recent"
    ? { where: " AND newest_pubdate <= ?", order: "newest_pubdate DESC", params: [recentCeiling()] }
    : { where: "", order: popularOrder, params: [] };
}

/** A link to one page of a listing, keeping the sort (popular is the bare URL). */
export function listHref(path: string, sort: ListSort, page = 1): string {
  const q = new URLSearchParams();
  if (sort === "recent") q.set("sort", "recent");
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
