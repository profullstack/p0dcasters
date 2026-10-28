import { safeImage } from "@/lib/format";
import {
  directPage,
  facet,
  fold,
  httpsOnly,
  snapshot,
  str,
  strs,
  sweep,
  type Facet,
  type NicheItem,
} from "./nichedb";

/** One radio-browser station, cut down to what a listing draws. */
export type Station = {
  id: string;
  name: string;
  stream: string;
  home: string | null;
  logo: string | null;
  cc: string | null;
  country: string | null;
  state: string | null;
  genres: string[];
  langs: string[];
  codec: string | null;
  bitrate: number | null;
  votes: number;
  clicks: number;
};

/**
 * Null when the station cannot play here: no stream, or a stream on plain
 * http, which an https page may not load (and an endless stream is not
 * something to push through our own proxy the way an episode file is).
 */
export function toStation(it: NicheItem): Station | null {
  const d = it.data || {};
  const stream = httpsOnly(d["streamUrl"] ?? d["stream"]);
  if (!stream) return null;
  if (d["online"] === false) return null;
  const cc = str(d["countryCode"]);
  return {
    id: str(d["stationUuid"]) || it.external_id,
    name: (str(d["name"]) || it.title || "Untitled station").slice(0, 160),
    stream,
    home: httpsOnly(d["homepage"] ?? it.url) || str(d["homepage"]),
    logo: safeImage(it.image_url) || null,
    cc: cc ? cc.toUpperCase() : null,
    country: str(d["country"]),
    state: str(d["state"]),
    genres: strs(d["genres"]).map((g) => g.toLowerCase()).slice(0, 8),
    langs: strs(d["languages"]).map((l) => l.toLowerCase()).slice(0, 4),
    codec: str(d["codec"]),
    bitrate: Number(d["bitrate"]) || null,
    votes: Number(d["votes"]) || 0,
    clicks: Number(d["clicksLast24h"]) || 0,
  };
}

async function build(): Promise<Station[]> {
  const items = await sweep("radio", ["online"]);
  const seen = new Set<string>();
  const out: Station[] = [];
  for (const it of items) {
    const s = toStation(it);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  // Most listened first: the last day's listens, then lifetime votes.
  return out.sort((a, b) => b.clicks - a.clicks || b.votes - a.votes || a.name.localeCompare(b.name));
}

export type RadioQuery = { q?: string; country?: string; genre?: string; page: number; per: number };

export type RadioResult = {
  /** False while the first snapshot is still being fetched. */
  complete: boolean;
  total: number;
  rows: Station[];
  countries: Facet[];
  genres: Facet[];
};

const facets = new WeakMap<Station[], { countries: Facet[]; genres: Facet[] }>();

export function filterStations(all: Station[], { q, country, genre }: Omit<RadioQuery, "page" | "per">) {
  const cc = country?.toUpperCase();
  const g = genre?.toLowerCase();
  const terms = q ? fold(q).split(/\s+/).filter(Boolean) : [];
  return all.filter((s) => {
    if (cc && s.cc !== cc) return false;
    if (g && !s.genres.includes(g)) return false;
    if (terms.length) {
      const hay = fold(`${s.name} ${s.country || ""} ${s.state || ""} ${s.genres.join(" ")}`);
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

export async function radio(query: RadioQuery): Promise<RadioResult> {
  const all = await snapshot("radio", build);
  if (all) {
    let f = facets.get(all);
    if (!f) {
      f = {
        countries: facet(all, (s) => s.cc),
        // A genre two stations share is a tag, not a genre.
        genres: facet(all, (s) => s.genres).filter((x) => x.n >= 25),
      };
      facets.set(all, f);
    }
    const hits = filterStations(all, query);
    const start = (query.page - 1) * query.per;
    return { complete: true, total: hits.length, rows: hits.slice(start, start + query.per), ...f };
  }

  // No snapshot yet (the first minutes after a deploy): one page straight from
  // nichedb, unranked, so the page still has stations on it.
  const tags = ["online"];
  if (query.country) tags.push(`country:${query.country.toLowerCase()}`);
  if (query.genre) tags.push(query.genre.toLowerCase());
  const items = await directPage("radio", {
    tags,
    q: query.q,
    limit: query.per,
    offset: (query.page - 1) * query.per,
  }).catch(() => [] as NicheItem[]);
  const rows = items.map(toStation).filter((s): s is Station => !!s);
  return { complete: false, total: rows.length, rows, countries: [], genres: [] };
}

/** Warm the snapshot without waiting on it (sitemaps, health). */
export async function stationCount(): Promise<number | null> {
  return (await snapshot("radio", build))?.length ?? null;
}
