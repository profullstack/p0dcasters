import { fetchEpisodes, publishedNewest } from "@/lib/feed";
import TimeAgo from "@/components/TimeAgo";
import { EpisodeList, PlayLatest, type Show } from "@/components/Episodes";

/**
 * Both of these read the publisher's feed, which is the slowest thing on the
 * page — a cold fetch of a large feed runs to several seconds. They are
 * rendered inside <Suspense> so the rest of the show page paints straight
 * away and the episodes stream in behind it. The two fetches are the same URL
 * in the same render, so React serves the second from the first.
 */
export async function LatestButton({ feedUrl, show }: { feedUrl: string; show: Show }) {
  const episodes = await fetchEpisodes(feedUrl);
  return <PlayLatest episodes={episodes} show={show} />;
}

/**
 * The header's "N episodes" and "3d ago latest". The directory row is only as fresh
 * as the last crawl, and this page has just read the feed, so it must not state an
 * older date than the list under it. The stored value is the Suspense fallback.
 * Only ever forward, like the crawler: a feed that trims its archive to its last
 * hundred episodes has not lost the rest.
 */
export async function EpisodeTotal({ feedUrl, stored }: { feedUrl: string; stored: number }) {
  const episodes = await fetchEpisodes(feedUrl);
  return <>{Math.max(stored, episodes.length).toLocaleString()}</>;
}

export async function LatestDate({ feedUrl, stored }: { feedUrl: string; stored: number | null }) {
  const episodes = await fetchEpisodes(feedUrl);
  return <TimeAgo unix={Math.max(stored ?? 0, publishedNewest(episodes)) || null} />;
}

export async function ShowEpisodes({ feedUrl, show }: { feedUrl: string; show: Show }) {
  const episodes = await fetchEpisodes(feedUrl);
  return (
    <>
      <h2 className="sec">
        Episodes
        {episodes.length > 0 && <span className="count"> {episodes.length}</span>}
      </h2>
      <EpisodeList episodes={episodes} show={show} />
    </>
  );
}
