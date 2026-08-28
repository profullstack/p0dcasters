import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import { currentUser } from "@/lib/auth/session";
import Card from "@/components/Card";
import FollowingFeed from "@/components/FollowingFeed";
import Ad from "@/components/Ad";
import AdBanner from "@/components/AdBanner";
import { AD_TEXT } from "@/lib/ads";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Following",
  robots: { index: false },
};

export default async function Following() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/following");

  const shows = await all<Podcast>(
    `SELECT p.* FROM follows f JOIN podcasts p ON p.slug = f.slug
      WHERE f.user_id = ? ORDER BY p.newest_pubdate DESC`,
    [user.id],
  );

  if (shows.length === 0) {
    return (
      <div className="wrap narrow">
        <h1>Following</h1>
        <p className="muted">
          Nothing here yet. Find a show you like and press <b>Follow</b> — its new
          episodes will collect on this page, ready to play.
        </p>
        <p>
          <Link className="btn primary" href="/browse">
            Browse the directory
          </Link>
        </p>
        <AdBanner />
      </div>
    );
  }

  return (
    <div className="wrap">
      <h1>Following</h1>
      <p className="muted">
        {shows.length.toLocaleString()} {shows.length === 1 ? "show" : "shows"}.
      </p>

      <FollowingFeed
        shows={shows.map((s) => ({
          slug: s.slug,
          title: s.title,
          image: s.image_url,
          host: s.host,
        }))}
      />

      {/* Below the new-episode feed, above the library. This page is a
          reader's own collection, so it gets the quietest unit there is and
          nothing else. */}
      <Ad format={AD_TEXT} />

      <section>
        <h2 className="sec">Your shows</h2>
        <div className="grid">
          {shows.map((s) => (
            <Card key={s.id} p={s} />
          ))}
        </div>
      </section>

      <AdBanner />
    </div>
  );
}
