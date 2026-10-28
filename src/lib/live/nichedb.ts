import { readFile, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Radio stations and TV channels are not ours: they are two nichedb.dev
 * collections (`radio` from radio-browser.info, `channels` from iptv-org),
 * read over nichedb's public, keyless API. Nothing is copied into the
 * directory's database.
 *
 * The API filters by tag but cannot rank by listeners or count a facet, and a
 * station page wants both. So each collection is held here as one compact
 * snapshot, paged in by id (keyset, `after=`), and every listing is cut from
 * memory. 70k stations is ~350 requests; nichedb allows 600 a minute per
 * caller and every fleet site on this box shares the address, so the pages are
 * spaced out and a full radio sweep takes a couple of minutes. It runs in the
 * background: the last good snapshot (in memory, then on disk) keeps serving,
 * and a page asked for before the first one lands gets `null` and says so.
 */

const API = process.env["NICHEDB_API_URL"] || "https://nichedb.dev/api/v1";
const UA = "p0dcasters.com/1.0 (+https://p0dcasters.com; radio and tv pages)";
const PAGE = 200;
const GAP_MS = 250;
const TTL_MS = 12 * 3600_000;
const RETRY_MS = 10 * 60_000;

export type NicheItem = {
  id: number;
  external_id: string;
  title: string;
  url: string | null;
  image_url: string | null;
  tags: string[];
  data: Record<string, unknown>;
};

type Snapshot<T> = { at: number; rows: T[] };

type Store<T> = {
  snap: Snapshot<T> | null;
  loading: Promise<void> | null;
  failedAt: number;
  diskTried: boolean;
};

const stores = new Map<string, Store<unknown>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<{ items: NicheItem[] }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return (await res.json()) as { items: NicheItem[] };
    // Over the per-minute allowance: wait it out rather than give up a sweep
    // that is most of the way done.
    if ((res.status === 429 || res.status === 402 || res.status >= 500) && attempt < 5) {
      await sleep(15_000 * (attempt + 1));
      continue;
    }
    throw new Error(`nichedb ${res.status} for ${url}`);
  }
}

/** Every item in a collection carrying all of `tags`, oldest id first. */
export async function sweep(collection: string, tags: string[]): Promise<NicheItem[]> {
  const out: NicheItem[] = [];
  let after = 0;
  for (;;) {
    const qs = new URLSearchParams({
      collection,
      limit: String(PAGE),
      sort: "id",
      order: "asc",
      after: String(after),
    });
    if (tags.length) qs.set("tags", tags.join(","));
    const { items } = await getJson(`${API}/items?${qs}`);
    out.push(...items);
    if (items.length < PAGE) return out;
    after = items[items.length - 1].id;
    await sleep(GAP_MS);
  }
}

/** One page of a collection straight from the API, for before a snapshot exists. */
export async function directPage(
  collection: string,
  opts: { tags?: string[]; q?: string; limit: number; offset?: number },
): Promise<NicheItem[]> {
  if (opts.q) {
    const qs = new URLSearchParams({ collection, q: opts.q, limit: String(Math.min(100, opts.limit)) });
    return (await getJson(`${API}/search?${qs}`)).items;
  }
  const qs = new URLSearchParams({
    collection,
    limit: String(Math.min(200, opts.limit)),
    offset: String(opts.offset || 0),
  });
  if (opts.tags?.length) qs.set("tags", opts.tags.join(","));
  return (await getJson(`${API}/items?${qs}`)).items;
}

function file(key: string) {
  return join(tmpdir(), `p0d-live-${key}.json`);
}

/**
 * The current snapshot for `key`, or null while the first one is still being
 * built. Never throws and never waits on the network unless `wait` is set: a
 * stale snapshot is served while a fresh one is fetched behind it.
 */
export async function snapshot<T>(
  key: string,
  build: () => Promise<T[]>,
  { wait = false }: { wait?: boolean } = {},
): Promise<T[] | null> {
  let s = stores.get(key) as Store<T> | undefined;
  if (!s) {
    s = { snap: null, loading: null, failedAt: 0, diskTried: false };
    stores.set(key, s as Store<unknown>);
  }
  const store = s;

  if (!store.snap && !store.diskTried) {
    store.diskTried = true;
    try {
      store.snap = JSON.parse(await readFile(file(key), "utf8")) as Snapshot<T>;
    } catch {
      /* first boot of this container */
    }
  }

  const stale = !store.snap || Date.now() - store.snap.at > TTL_MS;
  const backoff = Date.now() - store.failedAt < RETRY_MS;
  if (stale && !store.loading && !backoff) {
    store.loading = build()
      .then(async (rows) => {
        // An empty sweep is an upstream fault, not an empty world.
        if (!rows.length) throw new Error(`empty ${key} sweep`);
        store.snap = { at: Date.now(), rows };
        const tmp = `${file(key)}.tmp`;
        await writeFile(tmp, JSON.stringify(store.snap));
        await rename(tmp, file(key));
      })
      .catch((err) => {
        store.failedAt = Date.now();
        console.error(`[live] ${key} refresh failed:`, err);
      })
      .finally(() => {
        store.loading = null;
      });
  }
  if (!store.snap && wait && store.loading) await store.loading;
  return store.snap?.rows ?? null;
}

/** Only an https URL plays on an https page; see audio.ts for why no CSP can help. */
export function httpsOnly(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
}

export type Facet = { key: string; n: number };

export function facet<T>(rows: T[], pick: (row: T) => string[] | string | null): Facet[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = pick(r);
    for (const k of Array.isArray(v) ? v : v ? [v] : []) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/** Folded for matching: case and diacritics ignored. */
export function fold(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

export function countryName(cc: string): string {
  try {
    return regionNames?.of(cc.toUpperCase()) || cc.toUpperCase();
  } catch {
    return cc.toUpperCase();
  }
}

/** "américa" -> "América". format.titleCase's \b splits words at accented letters. */
export function label(s: string): string {
  return s.replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_, pre: string, c: string) => pre + c.toUpperCase());
}
