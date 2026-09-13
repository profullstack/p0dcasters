import { submitFeedTool } from "@profullstack/submit-feed";
import { fetchEpisodes } from "@/lib/feed";
import { browseCounts, directoryStats, listShows, searchShows, showBySlug, summary, SITE } from "@/lib/queries";
import { MAX_URLS, RATE_LIMIT, clientIpFromHeader, createBatch, hashIp, requestsThisHour, resolveSubmission, drainBatch } from "@/lib/submit";
import { toolError, rpcError, ERRORS } from "./protocol";

/**
 * What an agent can do with the directory.
 *
 * The descriptions are the interface: a model picks a tool by reading them and
 * nothing else, so they say what the tool answers and what it costs. Every
 * read is one the site serves publicly and anonymously; the one write,
 * `submit_feed`, carries the same per-address budget as the form.
 */

export type ToolContext = {
  header: (name: string) => string | null;
  /** Runs work after the response, when the host offers it. */
  after?: (fn: () => Promise<void>) => void;
};

export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: object;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run(args: any, ctx: ToolContext): Promise<unknown>;
};

function invalid(message: string) {
  return rpcError(ERRORS.INVALID_PARAMS, message);
}

function bounded(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export const TOOLS: Tool[] = [
  {
    name: "search",
    title: "Search the directory",
    description:
      "Full-text search over the titles, descriptions, authors and domains of every self-hosted podcast listed. Returns shows, each with its slug, feed URL, page and playlist. Shows on Spotify, Anchor, Buzzsprout and the other hosting platforms are excluded by design, so a mainstream show being absent says nothing about it.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for." },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Shows to return. Default 30." },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(args) {
      const query = String(args?.query ?? "").trim();
      if (!query) throw invalid("query is required");
      const rows = await searchShows(query, bounded(args?.limit, 30, 1, 100));
      return { query, shows: rows.map((p) => summary(p)) };
    },
  },
  {
    name: "get_podcast",
    title: "Read one show",
    description:
      "One show by slug: title, publisher, full description, episode count, cadence, language, categories, feed URL, site and page. Slugs come from search, list_shows and the page URL /podcast/<slug>. Episodes are a separate call, list_episodes, because they are read live from the publisher's feed.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(args) {
      const slug = String(args?.slug ?? "").trim();
      if (!slug) throw invalid("slug is required");
      const p = await showBySlug(slug);
      if (!p) throw toolError(`No show with slug '${slug}'. Try search.`);
      return summary(p, true);
    },
  },
  {
    name: "list_episodes",
    title: "Episodes of a show",
    description:
      "The episodes of one show, newest first, read live from the publisher's feed (cached half an hour): title, date, duration, description, audio URL. Feeds are slow, so this is the one call here that can take seconds. Also returns an M3U playlist URL for a player that takes one.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 300, description: "Episodes to return. Default 20." },
      },
      required: ["slug"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run(args) {
      const slug = String(args?.slug ?? "").trim();
      if (!slug) throw invalid("slug is required");
      const p = await showBySlug(slug);
      if (!p) throw toolError(`No show with slug '${slug}'. Try search.`);
      const episodes = await fetchEpisodes(p.feed_url);
      const limit = bounded(args?.limit, 20, 1, 300);
      return {
        slug: p.slug,
        title: p.title,
        feedUrl: p.feed_url,
        playlist: summary(p).playlist,
        total: episodes.length,
        episodes: episodes.slice(0, limit).map((e) => ({
          title: e.title,
          publishedAt: e.pubdate ? new Date(e.pubdate * 1000).toISOString() : null,
          seconds: e.duration,
          description: e.description,
          audio: e.source,
          link: e.link,
        })),
      };
    },
  },
  {
    name: "list_shows",
    title: "List shows by subject, language or domain",
    description:
      "Shows in one category (a single lowercase word such as history or comedy), one language (ISO 639-1 code) or on one domain, ranked by catalogue depth and longevity weighted by recency, the same order as the site's pages. Call browse first for the categories and languages that exist and how many shows each holds.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        language: { type: "string", description: "ISO 639-1, e.g. en, de, pt." },
        host: { type: "string", description: "A domain, e.g. example.org." },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Default 30." },
        offset: { type: "integer", minimum: 0 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(args) {
      const { rows, total } = await listShows({
        category: args?.category ? String(args.category) : undefined,
        language: args?.language ? String(args.language) : undefined,
        host: args?.host ? String(args.host) : undefined,
        limit: bounded(args?.limit, 30, 1, 100),
        offset: bounded(args?.offset, 0, 0, 1_000_000),
      });
      return { total, shows: rows.map((p) => summary(p)) };
    },
  },
  {
    name: "browse",
    title: "Subjects and languages",
    description: "Every category and every language in the directory with its show count and page URL. The cheap first call before list_shows.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run() {
      return browseCounts();
    },
  },
  {
    name: "directory_stats",
    title: "The directory in numbers",
    description: "Shows, domains, episodes, how many published this week, how many were added by their publishers, and the OPML export URL for taking the whole thing in one request.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run() {
      return directoryStats();
    },
  },
  submitFeedTool({
    directory: "p0dcasters",
    kind: "podcast",
    maxUrls: MAX_URLS,
    async run(args, ctx) {
      const c = ctx as ToolContext;
      const urls = (Array.isArray(args?.urls) ? args.urls : [args?.urls]).map((u: unknown) => String(u ?? "").trim()).filter(Boolean);
      if (urls.length === 0) throw invalid("urls is required");
      if (urls.length > MAX_URLS) throw invalid(`at most ${MAX_URLS} urls per call`);

      // The same per-address ledger the form writes to, so an agent and a
      // browser share one budget rather than the agent having a private one.
      const ipHash = hashIp(clientIpFromHeader(c.header));
      if ((await requestsThisHour(ipHash)) >= RATE_LIMIT) throw toolError("rate limited: twenty submissions an hour per address. Try again later.");

      const { batchId, ids } = await createBatch(urls, { userId: null, ipHash });
      const statusUrl = `${SITE}/submissions/${batchId}`;
      if (urls.length === 1) {
        const outcome = await resolveSubmission(ids[0]);
        if (!outcome) throw toolError("the submission could not be claimed; try again");
        if (outcome.status === "rejected") {
          return { ok: false, accepted: [], rejected: [{ url: urls[0], error: outcome.error, message: outcome.message }], queued: 0, total: 1, statusUrl };
        }
        if (outcome.status === "review") {
          return {
            ok: true,
            accepted: [],
            rejected: [],
            queued: 1,
            total: 1,
            submissionId: batchId,
            statusUrl,
            review: [{ url: urls[0], feedUrl: outcome.feedUrl, title: outcome.title }],
            note: "The feed was read and passes the rules; a person lists it after a look, usually the same day. Watch statusUrl.",
          };
        }
        return {
          ok: true,
          accepted: [{ url: urls[0], slug: outcome.slug, page: `${SITE}/podcast/${outcome.slug}`, existing: outcome.status === "existing", title: outcome.title, feedUrl: outcome.feedUrl }],
          rejected: [],
          queued: 0,
          total: 1,
          statusUrl,
        };
      }
      const work = () => drainBatch(batchId);
      if (c.after) c.after(work);
      else void work();
      return { ok: true, accepted: [], rejected: [], queued: urls.length, total: urls.length, submissionId: batchId, statusUrl };
    },
  }) as Tool,
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** A tool as tools/list describes it: everything but run. */
export function describe(tool: Tool) {
  return { name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations };
}
