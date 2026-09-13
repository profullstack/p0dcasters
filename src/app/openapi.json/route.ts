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
    openprofile: { type: "string", format: "uri", description: "The podcaster's OpenProfile.md" },
  },
};

const profile = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    slug: { type: "string" },
    name: { type: "string", nullable: true },
    markdown: { type: "string", description: "The OpenProfile.md as served" },
    url: { type: "string", format: "uri" },
    page: { type: "string", format: "uri" },
    show: { type: "string", format: "uri" },
    public: { type: "boolean" },
    claimed: { type: "boolean" },
    editable: { type: "boolean", description: "Whether the caller may PUT" },
    updatedAt: { type: "string", format: "date-time" },
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
      "/podcast/{slug}/openprofile.md": {
        get: {
          summary: "The podcaster's OpenProfile.md (logicsrc.com/openprofile), with the Broadcast section",
          operationId: "getOpenProfile",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "text/markdown", content: { "text/markdown": {} } }, 404: { description: "No such show, or a private profile" } },
        },
      },
      "/api/podcast/{slug}/openprofile": {
        get: {
          summary: "The same profile as JSON, and whether the caller may edit it",
          operationId: "getOpenProfileJson",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "The profile", content: { "application/json": { schema: profile } } }, 404: { description: "No such show" } },
        },
        put: {
          summary: "Correct the profile: the whole file as text/markdown, or a partial { identity, headline, sections, public } as JSON",
          operationId: "putOpenProfile",
          description:
            "The owner's session, an admin, or an OpenAccess bearer (hub https://openaccess.logicsrc.com, scope openprofile:edit) on the owner's behalf. Claim first. The server stores the difference from the generated document: a section left out keeps following the feed, a section written as `none` is removed.",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { content: { "text/markdown": {}, "application/json": { schema: { type: "object", properties: { markdown: { type: "string" }, identity: { type: "object" }, headline: { type: "string", nullable: true }, sections: { type: "object" }, public: { type: "boolean" } } } } } },
          responses: { 200: { description: "Saved", content: { "application/json": { schema: profile } } }, 403: { description: "Not the owner" }, 409: { description: "Unclaimed" } },
        },
      },
      "/api/podcast/{slug}/openprofile/claim": {
        post: {
          summary: "Claim the profile as the person behind the show",
          operationId: "claimOpenProfile",
          description:
            "Verified against the feed: the signed-in address is the feed's itunes:owner address, or the show's site or feed description links to the profile. An OpenAccess bearer with scopes openprofile:edit and email claims the same way. An admin passes { userEmail } to claim for someone.",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Claimed", content: { "application/json": { schema: profile } } }, 401: { description: "Not signed in" }, 403: { description: "Not verified; the body says what was checked" }, 409: { description: "Claimed by someone else" } },
        },
      },
      "/api/openprofiles": {
        get: {
          summary: "Every public podcaster profile, most recently changed first, for a directory that pulls",
          operationId: "listOpenProfiles",
          parameters: [
            { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
            { name: "cursor", in: "query", schema: { type: "string" } },
          ],
          responses: { 200: { description: "{ openprofiles: [{ id, name, url, page, show, updatedAt, accounts, web }], next }" } },
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
