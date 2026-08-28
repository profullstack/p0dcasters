import { createClient, type Client } from "@libsql/client";

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
