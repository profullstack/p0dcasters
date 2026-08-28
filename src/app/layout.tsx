import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { PlayerProvider } from "@/components/Player";
import { AccountNav, SessionProvider } from "@/components/Session";

export const metadata: Metadata = {
  metadataBase: new URL("https://p0dcasters.com"),
  title: {
    default: "p0dcasters — the independent podcast directory",
    template: "%s · p0dcasters",
  },
  description:
    "A directory of podcasts that live on their own domains. No Spotify, no Anchor, no Buzzsprout — every show here is self-hosted. Listen in the browser and follow your favourites.",
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
      {/*
        Every internal link is a next/link on purpose. The player lives in the
        layout and keeps playing across route changes — but only while the
        navigation is client side. A plain <a href> tears the document down and
        takes the audio with it.
      */}
      <body>
        <SessionProvider>
          <PlayerProvider>
            <header className="site">
              <div className="inner">
                <Link className="brand" href="/">
                  p<span>0</span>dcasters
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
                  <Link href="/opml">Full directory as OPML</Link> ·{" "}
                  <Link href="/sitemap.xml">Sitemap</Link> ·{" "}
                  <Link href="/about">How this is built</Link> ·{" "}
                  <Link href="/signup">Create an account</Link>
                </p>
              </div>
            </footer>
          </PlayerProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
