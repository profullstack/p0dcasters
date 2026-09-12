import { timeAgo } from "@/lib/format";

/**
 * The same "6d ago" the site has always shown, but wrapped in a real <time>
 * carrying the absolute instant.
 *
 * Every date on the directory was relative, which reads fine and pins nothing:
 * an answer engine quoting "published 6d ago" has no idea when it crawled, and
 * freshness is one of the few signals it weighs. datetime gives it the actual
 * date; the visible text stays as it was.
 */
export default function TimeAgo({ unix }: { unix: number | null | undefined }) {
  if (!unix) return <>undated</>;
  return <time dateTime={new Date(unix * 1000).toISOString()}>{timeAgo(unix)}</time>;
}
