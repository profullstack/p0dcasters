import { createClient, type Client } from "@libsql/client";
import { normalizeLang } from "@/lib/format";

// Next inlines `process.env.FOO` at build time. Reading through a variable key
// keeps the lookup dynamic so the value is read from the real runtime env on
// Railway instead of being frozen (and dropped) into the build output.
function env(key: string): string | undefined {
  return process.env[key];
}

let client: Client | null = null;

export function db(): Client {
  if (client) return client;
  const url = env("TURSO_DATABASE_URL");
  const authToken = env("TURSO_AUTH_TOKEN");
  client = url
    ? createClient({ url, authToken })
    : createClient({ url: "file:./data/p0dcasters.db" });
  return client;
}

export type Podcast = {
  id: number;
  slug: string;
  guid: string | null;
  feed_url: string;
  title: string;
  description: string;
  image_url: string;
  link: string | null;
  host: string;
  author: string | null;
  owner: string | null;
  explicit: number;
  language: string | null;
  lang_base: string | null;
  category: string | null;
  categories: string | null;
  episode_count: number;
  newest_pubdate: number;
  oldest_pubdate: number | null;
  created_on: number | null;
  latest_audio: string | null;
  latest_duration: number | null;
  generator: string | null;
  per_week: number | null;
  score: number;
};

// libSQL cannot bind `undefined` — it throws remotely but binds as null
// locally, so a test suite never catches it. Normalise before every query.
export function args(values: unknown[]): (string | number | null)[] {
  return values.map((v) =>
    v === undefined || v === null ? null : (v as string | number),
  );
}

export async function all<T = Podcast>(
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  const rs = await db().execute({ sql, args: args(values) });
  return rs.rows as unknown as T[];
}

export async function one<T = Podcast>(
  sql: string,
  values: unknown[] = [],
): Promise<T | null> {
  const rows = await all<T>(sql, values);
  return rows[0] ?? null;
}

export async function count(sql: string, values: unknown[] = []): Promise<number> {
  const row = await one<{ n: number }>(sql, values);
  return Number(row?.n ?? 0);
}

// --- languages ------------------------------------------------------------
//
// lang_base holds whatever the publisher declared, so one language turns up
// under several spellings (" en ", "en_US", "engli", "eng"). Everything below
// groups on the normalised ISO 639-1 code instead, so a language is a single
// bucket with a single URL — and a URL that would 404 is never linked or
// sitemapped. See normalizeLang, and the ingest fix in scripts/export_indie.py.

export type LanguageBucket = { code: string; n: number; raw: string[] };

async function rawLanguageRows() {
  return all<{ lang_base: string; n: number }>(
    "SELECT lang_base, COUNT(*) AS n FROM podcasts WHERE lang_base IS NOT NULL GROUP BY lang_base",
  );
}

/** Every language with a page behind it, most shows first. */
export async function languageBuckets(): Promise<LanguageBucket[]> {
  const rows = await rawLanguageRows();
  const by = new Map<string, LanguageBucket>();
  for (const r of rows) {
    const code = normalizeLang(r.lang_base);
    if (!code) continue; // "und", or a language with no two-letter code
    const b = by.get(code) ?? { code, n: 0, raw: [] };
    b.n += Number(r.n);
    b.raw.push(r.lang_base);
    by.set(code, b);
  }
  return [...by.values()].sort((a, b) => b.n - a.n);
}

/**
 * The raw lang_base spellings belonging to one canonical code, for a
 * `lang_base IN (…)` filter. Empty when the code names no shows.
 */
export async function languageVariants(code: string): Promise<string[]> {
  const want = normalizeLang(code);
  if (!want) return [];
  const rows = await rawLanguageRows();
  return rows.filter((r) => normalizeLang(r.lang_base) === want).map((r) => r.lang_base);
}
