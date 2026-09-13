import { submitOpenApiPath } from "@profullstack/submit-feed";

export const revalidate = 86400;

const SITE = "https://p0dcasters.com";

const show = {
  type: "object",
  properties: {
    slug: { type: "string" },
    title: { type: "string" },
    host: { type: "string" },
    author: { type: "string", nullable: true },
    description: { type: "string" },
    image: { type: "string", nullable: true },
    language: { type: "string", nullable: true },
    category: { type: "string", nullable: true },
    categories: { type: "array", items: { type: "string" } },
    episodes: { type: "integer" },
    cadence: { type: "string", nullable: true },
    newestAt: { type: "string", format: "date-time", nullable: true },
    feedUrl: { type: "string", format: "uri" },
    site: { type: "string", nullable: true },
    page: { type: "string", format: "uri" },
    playlist: { type: "string", format: "uri" },
  },
};

/** Every JSON endpoint, described. The submit path comes from the shared contract. */
export async function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "p0dcasters",
      version: "1.0.0",
      description:
        "A directory of podcasts that publish from their creator's own domain. Free, no key. Also an MCP server at /api/mcp and a CLI at /cli.",
      contact: { email: "hello@p0dcasters.com" },
    },
    servers: [{ url: SITE }],
    paths: {
      "/api/search": {
        get: {
          summary: "Search shows",
          operationId: "searchShows",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 30 } },
          ],
          responses: {
            200: { description: "Matching shows", content: { "application/json": { schema: { type: "object", properties: { query: { type: "string" }, shows: { type: "array", items: show } } } } } },
          },
        },
      },
      "/api/podcast/{slug}": {
        get: {
          summary: "One show",
          operationId: "getShow",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "The show", content: { "application/json": { schema: show } } }, 404: { description: "No such show" } },
        },
      },
      "/api/episodes/{slug}": {
        get: {
          summary: "A show's episodes, read live from its feed",
          operationId: "listEpisodes",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Episodes with audio URLs and a playlist URL" }, 404: { description: "No such show" } },
        },
      },
      "/api/submissions/{id}": {
        get: {
          summary: "The state of a submission batch",
          operationId: "getSubmission",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Each submitted URL and what became of it" }, 404: { description: "No such batch" } },
        },
      },
      "/opml": {
        get: {
          summary: "The whole directory as OPML",
          operationId: "exportOpml",
          parameters: [{ name: "category", in: "query", schema: { type: "string" } }],
          responses: { 200: { description: "OPML 2.0", content: { "text/x-opml": {} } } },
        },
      },
      ...submitOpenApiPath({ path: "/api/submit", summary: "Add a show by its site or feed URL" }),
    },
  };
  return Response.json(spec, { headers: { "access-control-allow-origin": "*" } });
}
