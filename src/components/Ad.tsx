import { AD_SLOT } from "@/lib/ads";

/**
 * One fixed-format ad position.
 *
 * Server-rendered with the slot id already on it, so crawlproof's ad.js finds
 * it on its single DOMContentLoaded pass and fills it with no JavaScript of
 * ours involved. (<AdBanner> is the exception, and says why.)
 *
 * No label here on purpose: ad.js prepends its own "Advertisement" caption to
 * every banner, and the text link ships with a "Sponsored" mark inside the
 * frame. Adding one would disclose the same unit twice.
 */
export default function Ad({ format, className = "" }: { format: string; className?: string }) {
  return (
    <div
      data-cp-ad=""
      data-slot={AD_SLOT}
      data-format={format}
      className={`ad ad-${format}${className ? ` ${className}` : ""}`}
    />
  );
}
