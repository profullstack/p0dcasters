/*
 * The only reason this file exists is installability.
 *
 * Chrome mints a WebAPK — the real install, the one that puts the manifest
 * icon on the home screen — only for a site that registers a service worker
 * with a fetch handler. With no worker at all, "Add to Home screen" on Android
 * falls back to a plain bookmark shortcut, and a shortcut is drawn from the
 * 32px favicon with a Chrome badge stamped over it. That is why the mark never
 * appeared there no matter how many icon sizes the manifest listed.
 *
 * It deliberately does not reuse cached HTML while online. Navigations hit the
 * network every time and only fall back to a stored copy once the network is
 * gone, so a deploy is never hidden behind a stale shell. Nothing else is
 * intercepted except /_next/static, which is content-hashed and therefore safe
 * to serve from cache forever. Icons are left alone on purpose: pinning those
 * is exactly the failure this change is meant to end.
 */

const CACHE = "p0dcasters-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
  }
});
