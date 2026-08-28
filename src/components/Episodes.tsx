"use client";

import { useMemo, useState } from "react";
import type { Episode } from "@/lib/feed";
import { clock, usePlayer, type Track } from "@/components/Player";
import { timeAgo } from "@/lib/format";

export type Show = { slug: string; title: string; image: string };

function toTracks(episodes: Episode[], show: Show): Track[] {
  return episodes.map((e) => ({
    id: `${show.slug}:${e.id}`,
    title: e.title,
    audio: e.audio,
    duration: e.duration,
    showSlug: show.slug,
    showTitle: show.title,
    image: e.image || show.image || null,
  }));
}

const PAGE = 25;

export function EpisodeList({
  episodes,
  show,
}: {
  episodes: Episode[];
  show: Show;
}) {
  const player = usePlayer();
  const [shown, setShown] = useState(PAGE);
  const tracks = useMemo(() => toTracks(episodes, show), [episodes, show]);

  if (episodes.length === 0) {
    return (
      <p className="muted">
        We could not read an episode list from this feed just now. The{" "}
        <b>RSS feed</b> button above still works in any podcast app.
      </p>
    );
  }

  return (
    <>
      <ol className="episodes">
        {tracks.slice(0, shown).map((t, i) => {
          const e = episodes[i];
          const current = player.isCurrent(t.id);
          return (
            <li key={t.id} className={current ? "episode on" : "episode"}>
              <button
                type="button"
                className="episode-play"
                onClick={() => player.toggle(t, tracks)}
                aria-label={
                  current && player.playing ? `Pause ${t.title}` : `Play ${t.title}`
                }
              >
                {current && player.playing ? "❚❚" : "▶"}
              </button>
              <div className="episode-body">
                <h3>{t.title}</h3>
                <p className="episode-meta">
                  {e.pubdate ? timeAgo(e.pubdate) : "undated"}
                  {e.duration ? ` · ${clock(e.duration)}` : ""}
                  {current ? " · playing" : ""}
                </p>
                {e.description && <p className="episode-desc">{e.description}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {shown < tracks.length && (
        <button
          type="button"
          className="btn"
          onClick={() => setShown((n) => n + PAGE)}
        >
          Show {Math.min(PAGE, tracks.length - shown)} more of {tracks.length}
        </button>
      )}
    </>
  );
}

/** The hero button. Starts at the newest episode with the rest queued behind. */
export function PlayLatest({ episodes, show }: { episodes: Episode[]; show: Show }) {
  const player = usePlayer();
  const tracks = useMemo(() => toTracks(episodes, show), [episodes, show]);
  if (tracks.length === 0) return null;
  const first = tracks[0];
  const current = player.isCurrent(first.id);
  return (
    <button
      type="button"
      className="btn primary"
      onClick={() => player.toggle(first, tracks)}
    >
      {current && player.playing ? "❚❚ Pause" : "▶ Play latest"}
    </button>
  );
}
