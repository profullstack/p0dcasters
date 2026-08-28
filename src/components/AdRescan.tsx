"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { rescanAds } from "@/lib/adScan";

/**
 * Re-run ad.js's fill pass after every client-side navigation.
 *
 * The player lives in the layout and keeps playing across route changes, which
 * is only true because navigation here never tears the document down. The cost
 * is that DOMContentLoaded fires exactly once per visit, and ad.js hangs its
 * only pass off it — so without this, the ad positions on every page after the
 * first would render as empty divs and the site would look unsold.
 *
 * Watching the query string as well as the path matters: paging through a
 * category (?page=2) swaps the whole grid, ad units included, without the
 * pathname changing at all.
 */
function Rescan() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => rescanAds(), [pathname, search]);

  return null;
}

export default function AdRescan() {
  // useSearchParams needs a boundary to suspend against; without one it opts
  // every page out of static rendering. Scoping it here keeps that to this
  // component, which renders nothing anyway.
  return (
    <Suspense fallback={null}>
      <Rescan />
    </Suspense>
  );
}
