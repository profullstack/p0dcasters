"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js, which is what makes the site installable rather than
 * bookmarkable. See public/sw.js for why that distinction decides which icon
 * Android puts on the home screen.
 *
 * Registration waits for load. Doing it earlier makes the worker's own fetches
 * compete with the page's for the same connections on a phone, which is the
 * one place this site is slow to begin with.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // A failed registration is not worth surfacing: the site works without a
    // worker, it just installs as a shortcut instead of an app.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
