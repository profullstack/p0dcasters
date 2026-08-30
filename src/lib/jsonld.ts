import type { Podcast } from "@/lib/db";
import { safeImage } from "@/lib/format";

const SITE = "https://p0dcasters.com";

/**
 * A listing page as one graph: what the page is, where it sits, and the shows
 * on it in the order they are shown. The ItemList carries only the first screen
 * of results — a page-two listing of 60 more of the same is noise, and the
 * position numbers would lie about the ranking anyway.
 */
export function listingJsonLd({
  path,
  name,
  description,
  crumb,
  rows,
  page,
}: {
  /** Path with no origin and no query, e.g. "/category/history". */
  path: string;
  name: string;
  description: string;
  /** The label between the site root and this page. */
  crumb: string;
  rows: Podcast[];
  page: number;
}) {
  const url = `${SITE}${path}`;
  // A listing is as fresh as the newest episode on it. Nothing else on these
  // pages carries a date, so without this the whole directory looks undated.
  const newest = rows.reduce((n, p) => Math.max(n, Number(p.newest_pubdate) || 0), 0);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name,
        description,
        isPartOf: { "@id": `${SITE}/#website` },
        ...(newest ? { dateModified: new Date(newest * 1000).toISOString() } : {}),
        // Only the unpaginated page claims to be the list itself; ?page=2
        // onwards is a continuation, not a second copy of it.
        ...(page === 1
          ? {
              mainEntity: {
                "@type": "ItemList",
                itemListOrder: "https://schema.org/ItemListOrderDescending",
                numberOfItems: rows.length,
                itemListElement: rows.slice(0, 20).map((p, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  item: {
                    "@type": "PodcastSeries",
                    "@id": `${SITE}/podcast/${p.slug}#series`,
                    name: p.title,
                    url: `${SITE}/podcast/${p.slug}`,
                    webFeed: p.feed_url,
                    ...(safeImage(p.image_url) ? { image: safeImage(p.image_url) } : {}),
                  },
                })),
              },
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "p0dcasters", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Browse", item: `${SITE}/browse` },
          { "@type": "ListItem", position: 3, name: crumb, item: url },
        ],
      },
    ],
  };
}

/** One <script type="application/ld+json">, stringified. */
export function jsonLdScript(data: unknown) {
  return { __html: JSON.stringify(data) };
}
