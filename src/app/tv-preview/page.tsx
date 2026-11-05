import type { Metadata } from "next";
import type { Podcast } from "@/lib/db";
import Card from "@/components/Card";

/**
 * Store-capture page. Renders the real grid with invented shows and no
 * artwork, so a screenshot carries none of the cover art or show names that
 * belong to the people who publish the feeds we list.
 *
 * It exists because the Amazon Appstore rejected com.p0dcasters.tv on
 * 2026-11-04: the screenshots were live captures of /search, so real third-party
 * cover art and titles sat in the store listing, which is exactly what their IP
 * policy forbids. Capture Fire TV screenshots HERE, never from /search.
 *
 * `image_url: ""` is the point — <Art> falls back to its own typographic tile,
 * so every square is drawn by us. Keep the names invented, and keep them
 * obviously generic so nobody reads them as a real show.
 */
export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false },
};

const SAMPLE: Array<Pick<Podcast, "title" | "host" | "episode_count"> & { days: number }> = [
  { title: "The Sample Show", host: "example.com", episode_count: 412, days: 1 },
  { title: "Morning Build Notes", host: "example.org", episode_count: 196, days: 2 },
  { title: "Field Recordings Weekly", host: "example.net", episode_count: 88, days: 1 },
  { title: "Two Founders Talking", host: "example.com", episode_count: 523, days: 3 },
  { title: "The Long Commute", host: "example.org", episode_count: 274, days: 1 },
  { title: "Kitchen Table History", host: "example.net", episode_count: 331, days: 4 },
  { title: "Nightshift Radio Hour", host: "example.com", episode_count: 605, days: 2 },
  { title: "Questions for Later", host: "example.org", episode_count: 147, days: 1 },
  { title: "A Walk and a Microphone", host: "example.net", episode_count: 239, days: 5 },
  { title: "Slow News Sunday", host: "example.com", episode_count: 164, days: 2 },
  { title: "The Back Catalogue", host: "example.org", episode_count: 718, days: 1 },
  { title: "Notes from the Workshop", host: "example.net", episode_count: 205, days: 3 },
];

const DAY = 86_400;

export default function TvPreviewPage() {
  const now = Math.floor(Date.now() / 1000);
  const shows = SAMPLE.map((s, i) => ({
    id: i + 1,
    slug: `sample-${i + 1}`,
    guid: null,
    feed_url: "",
    title: s.title,
    description: "",
    // Empty on purpose: <Art> draws our own letter tile instead.
    image_url: "",
    link: null,
    host: s.host,
    author: null,
    owner: null,
    explicit: 0,
    language: "en",
    lang_base: "en",
    category: null,
    categories: null,
    episode_count: s.episode_count,
    newest_pubdate: now - s.days * DAY,
    oldest_pubdate: null,
    created_on: null,
  })) as unknown as Podcast[];

  return (
    <main className="wrap">
      <section>
        <h2 className="sec">Browse every show</h2>
        <div className="grid">
          {shows.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
      </section>
    </main>
  );
}
