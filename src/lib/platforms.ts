import { count } from "@/lib/db";
import { networkHost } from "@/lib/networks";

/**
 * Hosting platforms: the companies a show's feed is served from.
 *
 * Until 2026-10-12 a show on a platform was not listed at all (Anchor
 * excepted). The directory now lists every live show wherever it is hosted,
 * and the platform rule is only a label: "hosted on Buzzsprout" on a show
 * page, and the line /self-hosted draws.
 *
 * The rule itself is unchanged and measured, not declared: a host carrying 25
 * or more live feeds in the Podcast Index is a platform, and export_indie.py
 * writes that list into `platform_hosts` at every rebuild (~310 domains). The
 * networks' own domains (twit.tv, npr.org ...; src/lib/networks.json) are left
 * out of it: they are publishers, not hosting companies.
 *
 * The names below are for display, and they double as the fallback for a
 * database whose `platform_hosts` is missing.
 */
export const PLATFORM_NAMES: Record<string, string> = {
  "anchor.fm": "Spotify for Creators",
  "spotify.com": "Spotify",
  "spotifycdn.com": "Spotify",
  "spotifyforpodcasters.com": "Spotify for Creators",
  "buzzsprout.com": "Buzzsprout",
  "spreaker.com": "Spreaker",
  "podbean.com": "Podbean",
  "rss.com": "RSS.com",
  "libsyn.com": "Libsyn",
  "acast.com": "Acast",
  "transistor.fm": "Transistor",
  "megaphone.fm": "Megaphone",
  "captivate.fm": "Captivate",
  "soundcloud.com": "SoundCloud",
  "podigee.io": "Podigee",
  "omnycontent.com": "Omny Studio",
  "omny.fm": "Omny Studio",
  "simplecast.com": "Simplecast",
  "riverside.com": "Riverside",
  "riverside.fm": "Riverside",
  "substack.com": "Substack",
  "ivoox.com": "iVoox",
  "redcircle.com": "RedCircle",
  "ausha.co": "Ausha",
  "feedburner.com": "FeedBurner",
  "firstory.me": "Firstory",
  "soundon.fm": "SoundOn",
  "subsplash.com": "Subsplash",
  "audiomeans.fr": "Audiomeans",
  "mave.digital": "Mave",
  "ximalaya.com": "Ximalaya",
  "castos.com": "Castos",
  "art19.com": "ART19",
  "podcaster.de": "podcaster.de",
  "stand.fm": "stand.fm",
  "podomatic.com": "Podomatic",
  "audioboom.com": "Audioboom",
  "letscast.fm": "LetsCast",
  "blubrry.com": "Blubrry",
  "kajabi.com": "Kajabi",
  "amperwave.net": "AmperWave",
  "pinecast.com": "Pinecast",
  "fireside.fm": "Fireside",
  "zencastr.com": "Zencastr",
  "squarespace.com": "Squarespace",
  "podcastics.com": "Podcastics",
  "iheart.com": "iHeartRadio",
  "pod.link": "pod.link",
  "podtrac.com": "Podtrac",
};

/** `a.b.c.d` -> [`a.b.c.d`, `b.c.d`, `c.d`] */
function suffixes(host: string): string[] {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i += 1) out.push(parts.slice(i).join("."));
  return out.length ? out : [host];
}

/** The platform's display name, when the host is one we can name. */
export function platformName(host: string): string | null {
  for (const t of suffixes(host)) if (PLATFORM_NAMES[t]) return PLATFORM_NAMES[t];
  return null;
}

/**
 * Is this feed host a hosting platform? Matched on the registrable tail, so
 * `feeds.buzzsprout.com` counts, and so does any subdomain of a measured host.
 * A network's own domain never does.
 */
export async function isPlatformHost(host: string): Promise<boolean> {
  if (networkHost(host)) return false;
  if (platformName(host)) return true;
  const tails = suffixes(host);
  try {
    const n = await count(
      `SELECT COUNT(*) AS n FROM platform_hosts WHERE host IN (${tails.map(() => "?").join(",")})`,
      tails,
    );
    return n > 0;
  } catch {
    return false;
  }
}

/** How a show page names where the feed lives. */
export async function hostedOn(host: string): Promise<{ kind: "platform" | "self"; name: string }> {
  const name = platformName(host);
  if (name) return { kind: "platform", name };
  if (await isPlatformHost(host)) return { kind: "platform", name: host };
  return { kind: "self", name: host };
}
