import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import "./globals.css";
import { PlayerProvider } from "@/components/Player";
import { AccountNav, SessionProvider } from "@/components/Session";
import AdRescan from "@/components/AdRescan";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  metadataBase: new URL("https://p0dcasters.com"),
  title: {
    default: "p0dcasters — the independent podcast directory",
    template: "%s · p0dcasters",
  },
  // 149 characters. The previous wording ran to 176 and lost its last clause to
  // truncation in exactly the snippet it was written for.
  description:
    "A free directory of podcasts that live on their own domains — no Spotify, no Anchor, no Buzzsprout. Every show is self-hosted. Listen in the browser.",
  openGraph: {
    type: "website",
    siteName: "p0dcasters",
    title: "p0dcasters — the independent podcast directory",
    description:
      "Podcasts that live on their own domains. Every show here is self-hosted, off the big platforms.",
  },
  twitter: { card: "summary_large_image" },
  // /favicon.ico and /icons/* are real files under public/; the manifest is
  // the src/app/manifest.ts route, which Next links on its own.
  icons: {
    icon: [
      // The .ico really does hold 16 and 32 and nothing else. It was declared
      // as 48x48 — Next's own default for the file — which is a size no
      // browser then finds inside it.
      { url: "/favicon.ico", sizes: "16x16 32x32" },
      { url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/icons/icon-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [180, 152, 144, 120, 114, 76, 72, 60, 57].map((n) => ({
      url: `/icons/apple-touch-icon-${n}x${n}.png`,
      sizes: `${n}x${n}`,
      type: "image/png",
    })),
  },
  appleWebApp: {
    capable: true,
    title: "p0dcasters",
    statusBarStyle: "default",
  },
  other: {
    // appleWebApp.capable does NOT emit apple-mobile-web-app-capable. Next
    // 15.5 emits the unprefixed mobile-web-app-capable for it and nothing
    // else (lib/metadata/generate/basic.tsx), and Safari reads only the
    // prefixed name — so iOS was told nothing and added the site as a plain
    // Safari bookmark, which is drawn from a page snapshot rather than the
    // touch icon. Set by hand until Next emits both.
    "apple-mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#fbfaf7",
    "msapplication-config": "/browserconfig.xml",
    "msapplication-TileImage": "/icons/icon-256x256.png",
  },
};

// Browser chrome follows the page, which is light/dark by prefers-color-scheme
// (see globals.css) — a single colour would leave a white bar over a dark page.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#14140f" },
  ],
};

// Sitewide identity, emitted once in the layout. Show pages reference the
// WebSite node by @id rather than repeating it. The SearchAction is the real
// /search form on the homepage — same endpoint, same `q` parameter.
const siteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://p0dcasters.com/#organization",
      name: "p0dcasters",
      url: "https://p0dcasters.com/",
      logo: "https://p0dcasters.com/icons/icon-512x512.png",
      description:
        "An independent podcast directory: every show listed publishes from a domain its creator controls.",
      email: "hello@p0dcasters.com",
      // Only profiles that actually belong to this directory. A sameAs list
      // padded with a Wikipedia or Crunchbase URL that resolves to nothing is
      // worse than none: it is the one field an answer engine will follow to
      // decide whether the entity is real.
      sameAs: ["https://github.com/profullstack/p0dcasters"],
      parentOrganization: {
        "@type": "Organization",
        name: "Profullstack",
        url: "https://profullstack.com/",
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "hello@p0dcasters.com",
        url: "https://p0dcasters.com/contact",
      },
    },
    {
      "@type": "WebSite",
      "@id": "https://p0dcasters.com/#website",
      name: "p0dcasters",
      alternateName: "the independent podcast directory",
      url: "https://p0dcasters.com/",
      inLanguage: "en",
      publisher: { "@id": "https://p0dcasters.com/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://p0dcasters.com/search?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        Every internal link is a next/link on purpose. The player lives in the
        layout and keeps playing across route changes — but only while the
        navigation is client side. A plain <a href> tears the document down and
        takes the audio with it.
      */}
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
        />
        <SessionProvider>
          <PlayerProvider>
            {/* First focusable thing on every page, so a keyboard or screen
                reader user can jump the header and the nav instead of tabbing
                through them on all 22k pages. Visible only while focused. */}
            <a className="skip-link" href="#main">
              Skip to main content
            </a>
            <header className="site">
              <div className="inner">
                <Link className="brand" href="/" aria-label="p0dcasters home">
                  {/*
                    Two files, not one recoloured: the wordmark is dark ink on the
                    light theme and white on the dark one. <picture> picks before
                    first paint, so there is no flash and no JS. Both were keyed to
                    transparency from the masters in src/app — those ship with a
                    flat background baked in, which drew a rectangle on the header.
                  */}
                  <picture>
                    <source srcSet="/logo-dark.png" media="(prefers-color-scheme: dark)" />
                    <img src="/logo.png" alt="p0dcasters" width={600} height={100} />
                  </picture>
                </Link>
                <nav>
                  <Link href="/browse">Browse</Link>
                  <Link href="/search">Search</Link>
                  <Link href="/hosts">Hosts</Link>
                  <Link href="/about">About</Link>
                  <AccountNav />
                </nav>
              </div>
            </header>
            <main id="main">{children}</main>
            <footer className="site">
              <div className="wrap">
                <p>
                  <strong>p0dcasters</strong> — independent, self-hosted podcasts only.
                  Feed metadata from the{" "}
                  <a href="https://podcastindex.org">Podcast Index</a>, filtered to shows
                  that publish from their own domain.
                </p>
                <p>
                  <Link href="/opml">Full directory as OPML</Link> ·{" "}
                  <Link href="/sitemap.xml">Sitemap</Link> ·{" "}
                  <Link href="/about">How this is built</Link> ·{" "}
                  <Link href="/crawlstats">Crawl status</Link> ·{" "}
                  <Link href="/signup">Create a free account</Link> to follow shows
                </p>
                <p>
                  <Link href="/contact">Contact</Link> ·{" "}
                  <Link href="/privacy">Privacy</Link> ·{" "}
                  <Link href="/terms">Terms</Link>
                </p>
              </div>
            </footer>
          </PlayerProvider>
        </SessionProvider>

        <Script
          data-site="e06bdaf4-e0f0-4e13-873a-21277fd6abd3"
          src="https://crawlproof.com/stats.js"
          strategy="afterInteractive"
        />

        {/*
          The ad loader, once for the site. It only ever acts on the
          [data-cp-ad] positions the pages themselves place (<Ad> and
          <AdBanner>) — there are deliberately none in here. The generated
          install dropped all four sizes at the bottom of <body>, which is a
          unit on the sign-in form and four stacked boxes under every footer;
          they are placed per page instead.

          <AdRescan> is what makes those positions work at all on a site whose
          navigation is client side; see the component.
        */}
        <Script src="https://crawlproof.com/ad.js" strategy="afterInteractive" />
        <AdRescan />
        <ServiceWorker />
      </body>
    </html>
  );
}
