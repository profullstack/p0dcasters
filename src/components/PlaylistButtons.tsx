"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The show as a playlist, three ways: open the M3U itself, copy its address
 * for a player's link box, and hand it straight to nixamp. The copy is the
 * one that needs a script; the other two are plain links.
 */
export default function PlaylistButtons({ url, nixamp }: { url: string; nixamp: string }) {
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
      // No clipboard API on plain http pages and some in-app browsers; the
      // Playlist link beside this opens the file, whose address can be copied.
      settle("failed");
    }
  };

  const label =
    state === "done" ? "Copied" : state === "failed" ? "Copy failed" : "Copy playlist URL";
  return (
    <>
      <a className="btn" href={url} rel="noopener" title="Every episode as an M3U playlist, oldest first">
        Playlist .m3u
      </a>
      <button
        type="button"
        className={state === "done" ? "btn playlist-copy done" : "btn playlist-copy"}
        onClick={copy}
        aria-label="Copy the playlist URL"
        title="Copy the playlist URL to paste into another player, such as nixamp"
      >
        {label}
      </button>
      <a
        className="btn"
        href={nixamp}
        rel="noopener"
        title="Go live with every episode of this show on nixamp"
      >
        Open in nixamp
      </a>
    </>
  );
}
