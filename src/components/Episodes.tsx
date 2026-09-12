"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Episode } from "@/lib/feed";
import { clock, usePlayer, type Track } from "@/components/Player";
import TimeAgo from "@/components/TimeAgo";

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

/**
 * Puts the publisher's audio URL on the clipboard so it can be pasted into
 * another player (nixamp's URL box, a terminal, a chat). It is the enclosure
 * as published rather than what our own player uses: the plain-http shows
 * stream here through a signed proxy that only this site can read.
 */
function CopyUrl({ url, title }: { url: string; title: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const settle = (next: "done" | "failed") => {
    setState(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1800);
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      settle("done");
    } catch {
      // Plain http pages and some in-app browsers have no clipboard API. The
      // selectable link right next to the button is the fallback there.
      settle("failed");
    }
  };

  const label =
    state === "done" ? "Copied" : state === "failed" ? "Copy failed" : "Copy URL";
  return (
    <span className="episode-copy">
      <button
        type="button"
        className={state === "done" ? "episode-copy-btn done" : "episode-copy-btn"}
        onClick={copy}
        aria-label={`Copy audio URL for ${title}`}
        title="Copy the audio URL to paste into another player, such as nixamp"
      >
        {label}
      </button>
      <a
        className="episode-copy-link"
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        title={url}
      >
        {url}
      </a>
    </span>
  );
}

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
                  <TimeAgo unix={e.pubdate} />
                  {e.duration ? ` · ${clock(e.duration)}` : ""}
                  {current ? " · playing" : ""}
                </p>
                <CopyUrl url={e.source} title={t.title} />
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
