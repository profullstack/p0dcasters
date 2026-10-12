import data from "./networks.json";

/**
 * The networks: the big publishers and broadcasters whose libraries are on
 * RSS -- TWiT, NPR, the BBC and the rest (src/lib/networks.json).
 *
 * A network is recognised from a show's own row, never stored on it: its
 * domain (`hosts`, the Podcast Index `host` column, which is the registrable
 * domain), a feed URL prefix (`urlPrefixes`, for a network whose feeds sit on
 * a shared host under its own path), or the exact owner/author name the feed
 * declares (`owners`, for networks on Megaphone, Omny and the like). The same
 * file is read by scripts/export_indie.py, which keeps the networks' own
 * domains out of `platform_hosts`, and by scripts/seed_networks.ts, which
 * lists the network shows the dump does not have.
 */

export type Seed = { kind: "opml" | "json" | "html"; url: string; pattern?: string };

export type Network = {
  slug: string;
  name: string;
  site: string;
  description: string;
  match: { hosts?: string[]; urlPrefixes?: string[]; owners?: string[] };
  seeds?: Seed[];
  feeds?: string[];
};

export const NETWORKS: Network[] = (data as { networks: Network[] }).networks;

const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function networkBySlug(slug: string): Network | null {
  return NETWORKS.find((n) => n.slug === slug) ?? null;
}

/** The network whose own domain this is (`feeds.twit.tv` -> TWiT). */
export function networkHost(host: string): Network | null {
  const h = lc(host).replace(/^www\./, "");
  return (
    NETWORKS.find((n) => (n.match.hosts ?? []).some((d) => h === lc(d) || h.endsWith(`.${lc(d)}`))) ?? null
  );
}

/** The network a show belongs to, if any. */
export function networkOf(p: { host: string; feed_url: string; owner: string | null; author: string | null }): Network | null {
  const byHost = networkHost(p.host);
  if (byHost) return byHost;
  const url = lc(p.feed_url);
  const owner = lc(p.owner);
  const author = lc(p.author);
  return (
    NETWORKS.find(
      (n) =>
        (n.match.urlPrefixes ?? []).some((pre) => url.startsWith(lc(pre))) ||
        (n.match.owners ?? []).some((o) => lc(o) === owner || lc(o) === author),
    ) ?? null
  );
}

/** A WHERE clause selecting a network's shows from `podcasts`. */
export function networkWhere(n: Network): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  const hosts = (n.match.hosts ?? []).map(lc);
  if (hosts.length) {
    parts.push(`host IN (${hosts.map(() => "?").join(",")})`);
    params.push(...hosts);
  }
  for (const pre of n.match.urlPrefixes ?? []) {
    parts.push("lower(feed_url) LIKE ?");
    params.push(`${lc(pre).replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  }
  const owners = (n.match.owners ?? []).map(lc);
  if (owners.length) {
    const q = owners.map(() => "?").join(",");
    parts.push(`lower(trim(owner)) IN (${q}) OR lower(trim(author)) IN (${q})`);
    params.push(...owners, ...owners);
  }
  return { sql: parts.length ? `(${parts.join(" OR ")})` : "(1 = 0)", params };
}

/** Every network's own domain, for the /self-hosted filter. */
export const NETWORK_HOSTS: string[] = [...new Set(NETWORKS.flatMap((n) => (n.match.hosts ?? []).map(lc)))];
