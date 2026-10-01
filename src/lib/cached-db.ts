import { all, count, languageBuckets, type LanguageBucket, type Podcast } from "@/lib/db";

/**
 * Directory reads memoised in this process, for the pages and feeds that used
 * to be prerendered at `next build` with ISR (`revalidate`).
 *
 * Prerendering read Postgres during the build, so the image could only be built
 * where the database answered, and the container rebuilt itself at every start;
 * a database blip at that moment left the site down (503, 2026-10-01). These
 * routes now render per request instead, and this cache keeps them as cheap as
 * ISR did: each distinct query runs at most once per TTL (the route's old
 * revalidate window), concurrent callers share one in-flight query, and when a
 * refresh fails the last good answer keeps being served, the way ISR served the
 * stale page.
 */

type Entry = { value: unknown; at: number };

const MAX_KEYS = 500;
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

async function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load()
      .then((value) => {
        store.delete(key);
        store.set(key, { value, at: Date.now() });
        if (store.size > MAX_KEYS) store.delete(store.keys().next().value!);
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    return await p;
  } catch (err) {
    if (hit) {
      console.error(`[cached-db] refresh failed, serving the last good answer: ${(err as Error).message}`);
      return hit.value as T;
    }
    throw err;
  }
}

/** all/count/languageBuckets with the given time-to-live, in seconds. */
export function cachedDb(ttlSeconds: number) {
  const ttl = ttlSeconds * 1000;
  return {
    all: <T = Podcast>(sql: string, values: unknown[] = []): Promise<T[]> =>
      memo(`${ttl}|all|${sql}|${JSON.stringify(values)}`, ttl, () => all<T>(sql, values)),
    count: (sql: string, values: unknown[] = []): Promise<number> =>
      memo(`${ttl}|count|${sql}|${JSON.stringify(values)}`, ttl, () => count(sql, values)),
    languageBuckets: (): Promise<LanguageBucket[]> =>
      memo(`${ttl}|languageBuckets`, ttl, () => languageBuckets()),
  };
}
