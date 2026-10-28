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
        "A directory of every live podcast with an RSS feed, on any host, including the big network libraries. Free, no key. Also an MCP server at /api/mcp and a CLI at /cli.",
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
      "/api/v1/newsletter": {
        get: {
          summary: "The weekly digest: schedule, next send time, latest issue",
          operationId: "getNewsletter",
          responses: {
            200: {
              description: "{ schedule, slot: { day, time, timezone }, week, nextSendAt, latest: { week, subject, createdAt, finishedAt, sent, url } | null, page, preview, subscribe }",
            },
          },
        },
      },
      "/api/v1/newsletter/preview": {
        get: {
          summary: "This week's issue as it would be built now",
          operationId: "previewNewsletter",
          description: "Built from the live directory, at most every 15 minutes. No recipients and nothing written; the per-reader unsubscribe link is left as `unsubscribePlaceholder`.",
          responses: {
            200: { description: "{ week, subject, html, text, sections, unsubscribePlaceholder, page }" },
            503: { description: "The preview could not be built" },
          },
        },
      },
      "/api/v1/newsletter/send": {
        post: {
          summary: "Run one pass of the weekly send (admins only)",
          operationId: "sendNewsletter",
          description: "Session cookie of an admin (ADMIN_EMAILS). A dry run unless dry_run is false: it returns the recipient count and the issue, and sends and writes nothing. A real pass sends nothing before the week's slot, never twice to one account in a week, and at most `limit` mails.",
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", properties: { dry_run: { type: "boolean", default: true }, limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } } },
              },
            },
          },
          responses: {
            200: { description: "{ dry_run, week, slotAt, nextAt, state, recipients, sent, failed, remaining, issue }" },
            401: { description: "Not signed in" },
            403: { description: "Not an admin" },
          },
        },
      },
      "/api/v1/me/newsletter": {
        get: {
          summary: "Whether the signed-in account gets the weekly digest",
          operationId: "getMyNewsletter",
          description: "Session cookie only.",
          responses: { 200: { description: "{ subscribed }" }, 401: { description: "Not signed in" } },
        },
        put: {
          summary: "Turn the weekly digest on or off for the signed-in account",
          operationId: "setMyNewsletter",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["subscribed"], properties: { subscribed: { type: "boolean" } } } } },
          },
          responses: { 200: { description: "{ subscribed }" }, 400: { description: "No boolean subscribed" }, 401: { description: "Not signed in" } },
        },
      },
      "/newsletter/unsubscribe": {
        post: {
          summary: "RFC 8058 one-click unsubscribe",
          operationId: "unsubscribeOneClick",
          description: "The URL in every issue's List-Unsubscribe header. Body `List-Unsubscribe=One-Click`; GET is the same link clicked in a browser, HEAD records nothing.",
          parameters: [
            { name: "u", in: "query", required: true, schema: { type: "string" }, description: "User id" },
            { name: "t", in: "query", required: true, schema: { type: "string" }, description: "HMAC of the user id" },
          ],
          responses: { 200: { description: "Unsubscribed" }, 400: { description: "Bad token; nothing changed" } },
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
