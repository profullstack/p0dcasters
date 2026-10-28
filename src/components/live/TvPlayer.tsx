"use client";

import { useEffect, useRef, useState } from "react";
import { Player } from "@profullstack/player/react";
import "@profullstack/player/player.css";
import { usePlayer } from "@/components/Player";

/**
 * A channel's live stream, in the house player (hls.js where the browser
 * needs it, native HLS where it does not). iptv-org lists streams it last saw
 * working, not ones that are promised to; when one fails the reader can try
 * the channel's other https streams from the buttons underneath.
 */
export default function TvPlayer({ streams, poster, name }: { streams: string[]; poster?: string | null; name: string }) {
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const audio = usePlayer();
  const pauseAudio = useRef(audio.pause);
  pauseAudio.current = audio.pause;

  // Two things playing at once is never what anyone wants: starting the
  // picture stops the radio or episode in the dock. Media events do not
  // bubble, so this listens in the capture phase.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onPlay = () => pauseAudio.current();
    el.addEventListener("play", onPlay, true);
    return () => el.removeEventListener("play", onPlay, true);
  }, []);

  return (
    <div className="tv-stage-wrap">
      <div className="tv-stage" ref={box}>
        <Player
          key={streams[at]}
          src={streams[at]}
          live
          poster={poster || undefined}
          useTimeParam={false}
          shareable={false}
          unplayableSubject={name}
        />
      </div>
      {streams.length > 1 && (
        <div className="tv-streams" role="group" aria-label="Streams">
          <span>Stream:</span>
          {streams.map((s, i) => (
            <button
              type="button"
              key={s}
              className={`btn small${i === at ? " primary" : ""}`}
              onClick={() => setAt(i)}
              aria-pressed={i === at}
            >
              {i + 1}
            </button>
          ))}
          <span className="small">If the picture does not start, try another.</span>
        </div>
      )}
    </div>
  );
}
