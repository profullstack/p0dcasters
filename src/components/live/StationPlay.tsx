"use client";

import { usePlayer, type Track } from "@/components/Player";

export type StationTrack = Pick<Track, "id" | "title" | "audio" | "image"> & { country: string };

/**
 * Plays a station in the site's own audio dock, so it keeps playing while the
 * reader browses podcasts. The queue is the stations on this page, which is
 * what the dock's next/previous would mean if a live stream had them.
 */
export default function StationPlay({ station }: { station: StationTrack }) {
  const p = usePlayer();
  const current = p.isCurrent(station.id);
  const on = current && p.playing;
  const track: Track = {
    id: station.id,
    title: station.title,
    audio: station.audio,
    duration: null,
    showSlug: "",
    showTitle: station.country ? `Live radio · ${station.country}` : "Live radio",
    image: station.image,
    href: "/radio",
    live: true,
  };
  return (
    <button
      type="button"
      className={`live-play${on ? " on" : ""}`}
      onClick={() => p.toggle(track)}
      aria-label={on ? `Pause ${station.title}` : `Play ${station.title}`}
      aria-pressed={on}
    >
      {on ? (p.loading ? "…" : "❚❚") : "▶"}
    </button>
  );
}
