import { fetchEpisodes } from "@/lib/feed";
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
