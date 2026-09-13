import { count } from "@/lib/db";

/**
 * The hosting platforms this directory does not list.
 *
 * The directory's one rule is measured, not declared: a host carrying 25 or
 * more live feeds in the Podcast Index is a platform, and export_indie.py
 * writes that list into `platform_hosts` at every rebuild (307 domains on
 * 2026-09-09). A submission is checked against the table first. The list
 * below is the fallback for a database that has not been rebuilt since the
 * table was added, and it is the well-known names only: a platform the table
 * would catch and this list would not is exactly what the table is for.
 *
 * One platform is let through on purpose. Anchor (Spotify for Creators) is
 * the free host where most genuinely independent shows start and the largest
 * host in the index by far, and treating it as "commercial" threw out exactly
 * the long tail of one-person shows the directory exists for. Since
 * 2026-09-13 it is allowed here and in scripts/export_indie.py
 * (ALLOWED_PLATFORMS there, kept the same), so a submitted Anchor show and a
 * dump-listed one are judged alike. The paid hosts and the networks stay out.
 */
export const ALLOWED_PLATFORMS = ["anchor.fm"];

export const KNOWN_PLATFORMS = [
  "spotify.com",
  "spotifycdn.com",
  "buzzsprout.com",
  "libsyn.com",
  "megaphone.fm",
  "simplecast.com",
  "transistor.fm",
  "podbean.com",
  "spreaker.com",
  "soundcloud.com",
  "acast.com",
  "captivate.fm",
  "redcircle.com",
  "audioboom.com",
  "blubrry.com",
  "podomatic.com",
  "castos.com",
  "rss.com",
  "omny.fm",
  "art19.com",
  "podigee.io",
  "ausha.co",
  "zencastr.com",
  "pinecast.com",
  "fireside.fm",
  "squarespace.com",
  "ivoox.com",
  "audioboom.com",
  "podcasts.apple.com",
  "feeds.npr.org",
  "iheart.com",
  "pod.link",
  "podcastics.com",
  "spotifyforpodcasters.com",
];

/**
 * Is this feed host a hosting platform?
 *
 * Matched on the registrable tail, so `feeds.buzzsprout.com` and
 * `anchor.fm` are both platforms, and so is any subdomain of a host in the
 * measured list.
 */
export async function isPlatformHost(host: string): Promise<boolean> {
  const h = host.toLowerCase().replace(/^www\./, "");
  const tails = suffixes(h);
  for (const t of tails) if (ALLOWED_PLATFORMS.includes(t)) return false;
  for (const t of tails) if (KNOWN_PLATFORMS.includes(t)) return true;
  try {
    const n = await count(
      `SELECT COUNT(*) AS n FROM platform_hosts WHERE host IN (${tails.map(() => "?").join(",")})`,
      tails,
    );
    return n > 0;
  } catch {
    // The table does not exist until the next rebuild; the list above stands.
    return false;
  }
}

/** `a.b.c.d` -> [`a.b.c.d`, `b.c.d`, `c.d`] */
function suffixes(host: string): string[] {
  const parts = host.split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i += 1) out.push(parts.slice(i).join("."));
  return out.length ? out : [host];
}
