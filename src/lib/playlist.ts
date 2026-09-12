import type { Episode } from "./feed";

/** Where a show's playlist lives, for the page, the API and the copy button. */
export function playlistUrl(slug: string): string {
  return `https://p0dcasters.com/podcast/${encodeURIComponent(slug)}/playlist.m3u`;
}

/**
 * nixamp.com with the playlist already in its link box, ready to go live.
 * The address is the M3U, not a track: nixamp reads the list and plays it
 * through, so the whole show is one paste.
 */
export function nixampUrl(playlist: string): string {
  return `https://nixamp.com/?link=${encodeURIComponent(playlist)}`;
}

// A title is the rest of an #EXTINF line, so a newline in one would start a
// new entry and a control byte confuses more than one player. Built via
// RegExp so the source file itself stays free of control characters.
const CONTROL = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

function line(s: string): string {
  return (s || "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

/**
 * Every episode of a show as an extended M3U, oldest first.
 *
 * Oldest first because the point of the file is to play a whole show through
 * in a player that takes a playlist URL, nixamp among them: a stream that
 * starts at episode one and runs forward is the show; one that starts at the
 * newest and runs backwards is not. The feed's own order is newest first and
 * the page keeps that.
 *
 * Each entry is the publisher's enclosure as written, never this site's
 * signed proxy, since the file is for players that are not this site.
 */
export function toM3U(title: string, slug: string, episodes: Episode[]): string {
  const ordered = [...episodes].sort((a, b) => a.pubdate - b.pubdate);
  const out = ["#EXTM3U", `#PLAYLIST:${line(title)}`, `#EXTURL:${playlistUrl(slug)}`];
  for (const e of ordered) {
    const seconds = e.duration && e.duration > 0 ? Math.round(e.duration) : -1;
    out.push(`#EXTINF:${seconds},${line(e.title) || "Episode"}`);
    if (e.image) out.push(`#EXTIMG:${e.image}`);
    out.push(e.source);
  }
  return out.join("\n") + "\n";
}
