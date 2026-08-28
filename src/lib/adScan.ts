/*
 * Asking crawlproof's ad.js to look at the DOM again.
 *
 * ad.js fills every [data-cp-ad] once, at DOMContentLoaded, and then never
 * again on its own. That is fine for a site of documents and wrong for this
 * one: every internal link here is a next/link, so after the first paint the
 * document is never torn down again and no page a reader navigates to would
 * ever have its units filled.
 *
 * fill() latches on data-cp-filled, so re-scanning is free — an element that
 * already has a creative is skipped, and no impression is requested twice.
 *
 * This module is imported by client components. It must stay free of imports
 * of its own so nothing server-only can be dragged into the browser bundle.
 */

declare global {
  interface Window {
    crawlproofAds?: { scan: () => void };
  }
}

/**
 * Scan now if ad.js has loaded, otherwise poll for it and scan when it lands.
 *
 * ad.js loads `afterInteractive`, so a component mounting early can easily beat
 * it. The poll is bounded: when an ad blocker eats the script it never arrives,
 * and an unbounded timer would sit there for the life of the page.
 *
 * @returns a cleanup function, for use as an effect's return value
 */
export function rescanAds(): () => void {
  if (typeof window === "undefined") return () => {};

  if (window.crawlproofAds) {
    window.crawlproofAds.scan();
    return () => {};
  }

  let tries = 0;
  const timer = window.setInterval(() => {
    if (window.crawlproofAds) {
      window.crawlproofAds.scan();
      window.clearInterval(timer);
    } else if ((tries += 1) > 20) {
      window.clearInterval(timer);
    }
  }, 150);

  return () => window.clearInterval(timer);
}
