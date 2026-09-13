import { all, one, count, languageBuckets, languageVariants } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import { tokenise, ftsQuery } from "@/lib/search";
import { cadence, languageName, normalizeLang, safeImage } from "@/lib/format";
import { playlistUrl } from "@/lib/playlist";

/**
 * The directory's reads, once, for every machine surface: the JSON routes,
 * the MCP tools and the CLI behind them all ask these. The HTML pages have
 * their own queries with their own paging and ads; these are the shapes an
 * agent or a script wants, which is fewer columns and a stable name for each.
 */

export const SITE = "https://p0dcasters.com";

export type ShowSummary = {
  slug: string;
  title: string;
  host: string;
  author: string | null;
  description: string;
  image: string | null;
  language: string | null;
  category: string | null;
  categories: string[];
  episodes: number;
  cadence: string | null;
  newestAt: string | null;
  feedUrl: string;
  site: string | null;
  page: string;
  playlist: string;
};

export function summary(p: Podcast, full = false): ShowSummary {
  const lang = normalizeLang(p.lang_base ?? p.language ?? "");
  return {
    slug: p.slug,
    title: p.title,
    host: p.host,
    author: p.author,
    description: full ? p.description : clip(p.description, 240),
    image: safeImage(p.image_url) || null,
    language: lang ? `${lang} (${languageName(lang)})` : null,
    category: p.category,
    categories: p.categories ? p.categories.split(",").filter(Boolean) : [],
    episodes: Number(p.episode_count),
    cadence: cadence(p.per_week),
    newestAt: p.newest_pubdate ? new Date(Number(p.newest_pubdate) * 1000).toISOString() : null,
    feedUrl: p.feed_url,
    site: p.link,
    page: `${SITE}/podcast/${p.slug}`,
    playlist: playlistUrl(p.slug),
  };
}

function clip(s: string, n: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

export async function searchShows(q: string, limit = 30): Promise<Podcast[]> {
  const tokens = tokenise(q);
  if (!tokens.length) return [];
  const sql = `SELECT p.* FROM podcasts_fts f JOIN podcasts p ON p.id = f.rowid
               WHERE podcasts_fts MATCH ? ORDER BY bm25(podcasts_fts, 8.0, 1.0, 3.0, 4.0) LIMIT ?`;
  let rows = await all<Podcast>(sql, [ftsQuery(tokens, "AND"), limit]);
  if (!rows.length && tokens.length > 1) rows = await all<Podcast>(sql, [ftsQuery(tokens, "OR"), limit]);
  return rows;
}

export async function showBySlug(slug: string): Promise<Podcast | null> {
  return one<Podcast>("SELECT * FROM podcasts WHERE slug = ?", [slug]);
}

/** Shows in one subject, language or host, ranked like the pages are. */
export async function listShows(opts: {
  category?: string;
  language?: string;
  host?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: Podcast[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.category) {
    where.push("category = ?");
    params.push(opts.category.toLowerCase());
  }
  if (opts.language) {
    const variants = await languageVariants(opts.language);
    if (!variants.length) return { rows: [], total: 0 };
    where.push(`lang_base IN (${variants.map(() => "?").join(",")})`);
    params.push(...variants);
  }
  if (opts.host) {
    where.push("host = ?");
    params.push(opts.host.toLowerCase().replace(/^www\./, ""));
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 100);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  const [rows, total] = await Promise.all([
    all<Podcast>(`SELECT * FROM podcasts ${w} ORDER BY score DESC, newest_pubdate DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
    count(`SELECT COUNT(*) AS n FROM podcasts ${w}`, params),
  ]);
  return { rows, total };
}

export async function browseCounts() {
  const [cats, langs] = await Promise.all([
    all<{ category: string; n: number }>(
      "SELECT category, COUNT(*) AS n FROM podcasts WHERE category IS NOT NULL GROUP BY category ORDER BY n DESC",
    ),
    languageBuckets(),
  ]);
  return {
    categories: cats.map((c) => ({ category: c.category, shows: Number(c.n), url: `${SITE}/category/${encodeURIComponent(c.category)}` })),
    languages: langs.map((l) => ({ code: l.code, name: languageName(l.code), shows: l.n, url: `${SITE}/language/${l.code}` })),
  };
}

export async function directoryStats() {
  const [shows, hosts, episodes, fresh7, submitted] = await Promise.all([
    count("SELECT COUNT(*) AS n FROM podcasts"),
    count("SELECT COUNT(DISTINCT host) AS n FROM podcasts"),
    count("SELECT COALESCE(SUM(episode_count),0) AS n FROM podcasts"),
    count("SELECT COUNT(*) AS n FROM podcasts WHERE newest_pubdate > ?", [Math.floor(Date.now() / 1000) - 7 * 86400]),
    count("SELECT COUNT(*) AS n FROM submissions WHERE status = 'listed'").catch(() => 0),
  ]);
  return { shows, hosts, episodes, publishedThisWeek: fresh7, submittedByPublishers: submitted, opml: `${SITE}/opml` };
}
