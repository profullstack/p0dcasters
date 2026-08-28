import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://p0dcasters.com"),
  title: {
    default: "p0dcasters — the independent podcast directory",
    template: "%s · p0dcasters",
  },
  description:
    "A directory of podcasts that live on their own domains. No Spotify, no Anchor, no Buzzsprout — every show here is self-hosted.",
  openGraph: {
    type: "website",
    siteName: "p0dcasters",
    title: "p0dcasters — the independent podcast directory",
    description:
      "Podcasts that live on their own domains. Every show here is self-hosted, off the big platforms.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="inner">
            <a className="brand" href="/">
              p<span>0</span>dcasters
            </a>
            <nav>
              <a href="/browse">Browse</a>
              <a href="/search">Search</a>
              <a href="/hosts">Hosts</a>
              <a href="/about">About</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site">
          <div className="wrap">
            <p>
              <strong>p0dcasters</strong> — independent, self-hosted podcasts only.
              Feed metadata from the{" "}
              <a href="https://podcastindex.org">Podcast Index</a>, filtered to shows
              that publish from their own domain.
            </p>
            <p>
              <a href="/opml">Full directory as OPML</a> ·{" "}
              <a href="/sitemap.xml">Sitemap</a> · <a href="/about">How this is built</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
