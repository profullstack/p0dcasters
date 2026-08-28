import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest; Next links it from every page for us.
 *
 * The maskable-* entries are separate files, not the same PNGs tagged
 * "any maskable": the mark's broadcast arcs sit ~12% from the top edge, so an
 * Android circle mask would clip them. maskable-* are the same artwork inset
 * to the 80% safe zone. Regenerate them from src/app/favicon.png if the mark
 * changes — the size-named icons come out of the favicon generator, these
 * two do not.
 *
 * Nothing below 128px belongs in here. The manifest icon list is what a
 * launcher picks the home screen icon from, and the 16/32/48 entries that used
 * to lead it are favicon sizes: a picker that walks the list in order rather
 * than by area lands on a 16px image and draws a blurred smudge. Favicons are
 * declared in layout.tsx, where they belong, and only there.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Pinned so the install identity survives a future change to start_url.
    // Without it a launcher keys the installed app on start_url and a change
    // there orphans the existing install instead of updating it.
    id: "/",
    name: "p0dcasters — the independent podcast directory",
    short_name: "p0dcasters",
    description:
      "A directory of podcasts that live on their own domains. Every show here is self-hosted, off the big platforms.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#fbfaf7",
    categories: ["entertainment", "news", "music"],
    icons: [
      { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-256x256.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/maskable-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
