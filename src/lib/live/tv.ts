import { safeImage } from "@/lib/format";
import { facet, fold, httpsOnly, snapshot, str, strs, sweep, type Facet, type NicheItem } from "./nichedb";

/** One iptv-org channel with a public stream that can play on an https page. */
export type Channel = {
  id: string;
  name: string;
  stream: string;
  /** Further https streams for the same channel, tried when the first fails. */
  alts: string[];
  quality: string | null;
  logo: string | null;
  website: string | null;
  cc: string | null;
  categories: string[];
  langs: string[];
  network: string | null;
  owners: string[];
  altNames: string[];
};

/**
 * Null unless the channel has at least one https stream. An http:// stream is
 * blockable mixed content on this page and no policy can let it back in, so a
 * channel whose only stream is http is left out rather than listed broken.
 */
export function toChannel(it: NicheItem): Channel | null {
  const d = it.data || {};
  if (d["isNsfw"] === true || d["closed"]) return null;
  const urls: string[] = [];
  const add = (u: unknown) => {
    const s = httpsOnly(u);
    if (s && !urls.includes(s)) urls.push(s);
  };
  add(d["streamUrl"]);
  for (const s of Array.isArray(d["streams"]) ? d["streams"] : []) add((s as { url?: unknown })?.url);
  if (!urls.length) return null;
  const id = str(d["channelId"]) || it.external_id.replace(/^iptv-org:channel:/, "");
  const cc = str(d["country"]);
  return {
    id,
    name: (it.title || id).slice(0, 160),
    stream: urls[0],
    alts: urls.slice(1, 4),
    quality: str(d["quality"]),
    logo: safeImage(str(d["logo"]) || it.image_url) || null,
    website: httpsOnly(d["website"]) || str(d["website"]),
    cc: cc ? cc.toUpperCase() : null,
    categories: strs(d["categories"]).map((c) => c.toLowerCase()),
    langs: strs(d["languages"]),
    network: str(d["network"]),
    owners: strs(d["owners"]).slice(0, 4),
    altNames: strs(d["altNames"]).slice(0, 6),
  };
}

async function build(): Promise<Channel[]> {
  const items = await sweep("channels", ["streamable"]);
  const seen = new Set<string>();
  const out: Channel[] = [];
  for (const it of items) {
    const c = toChannel(it);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The channel list. Small enough (about ten thousand with a stream, ~50
 * requests) that a request made before the first snapshot simply waits for it.
 */
export async function channels(): Promise<Channel[]> {
  return (await snapshot("channels", build, { wait: true })) ?? [];
}

export type TvQuery = { q?: string; country?: string; category?: string; page: number; per: number };

export function filterChannels(all: Channel[], { q, country, category }: Omit<TvQuery, "page" | "per">) {
  const cc = country?.toUpperCase();
  const cat = category?.toLowerCase();
  const terms = q ? fold(q).split(/\s+/).filter(Boolean) : [];
  return all.filter((c) => {
    if (cc && c.cc !== cc) return false;
    if (cat && !c.categories.includes(cat)) return false;
    if (terms.length) {
      const hay = fold(`${c.name} ${c.altNames.join(" ")} ${c.network || ""} ${c.owners.join(" ")} ${c.categories.join(" ")}`);
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

const facets = new WeakMap<Channel[], { countries: Facet[]; categories: Facet[] }>();

export async function tv(query: TvQuery) {
  const all = await channels();
  let f = facets.get(all);
  if (!f) {
    f = { countries: facet(all, (c) => c.cc), categories: facet(all, (c) => c.categories) };
    facets.set(all, f);
  }
  const hits = filterChannels(all, query);
  const start = (query.page - 1) * query.per;
  return { total: hits.length, rows: hits.slice(start, start + query.per), ...f };
}

export async function channel(id: string): Promise<Channel | null> {
  return (await channels()).find((c) => c.id === id) ?? null;
}
