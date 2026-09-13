export const revalidate = 86400;

// What an agent can actually do here: the read surface, and the one write.
export async function GET() {
  const body = `# p0dcasters

Find podcasts that publish from their creator's own domain, rather than from a large
hosting platform, and add one. No key, no account, no rate card.

## When to use this

Use p0dcasters when someone wants independent or self-hosted podcasts, podcasts on a
subject that are not on the big platforms, or a machine-readable list of them, or when
someone wants their own self-hosted show listed. Do not use it as a general podcast
search: shows on Spotify, Anchor, Buzzsprout, Libsyn and the other large hosts are excluded
by design, so a mainstream show will usually be absent, and its absence says nothing about
the show.

## MCP

\`https://p0dcasters.com/api/mcp\` (Streamable HTTP, stateless, no auth) offers \`search\`,
\`get_podcast\`, \`list_episodes\`, \`list_shows\`, \`browse\`, \`directory_stats\` and
\`submit_feed\`. Discovery file: \`/.well-known/openmcp.json\`. The same calls exist over
plain HTTP below, described in \`/openapi.json\`.

## Tools

- **Search** — \`GET /api/search?q=<terms>&limit=<n>\`
  Full-text over titles, descriptions, authors and hosts; JSON. The HTML form is
  \`GET /search?q=\`, disallowed in robots.txt for crawlers.

- **Read one show** — \`GET /api/podcast/<slug>\`
  Title, publisher, description, episode count, cadence, language, feed URL, site, page.
  The HTML page \`/podcast/<slug>\` carries schema.org PodcastSeries JSON-LD.

- **Episodes** — \`GET /api/episodes/<slug>\`
  The show's episodes read live from its feed, with audio URLs and an M3U playlist URL.

- **Browse subjects and languages** — \`GET /browse\`
  Every category and language with a show count. Categories are single words
  (history, comedy, science); languages are ISO 639-1 codes.

- **List a subject or language** — \`GET /category/<subject>?page=<n>\`, \`GET /language/<code>?page=<n>\`
  60 shows a page, ranked by catalogue depth and longevity weighted by recency.

- **Take the whole directory** — \`GET /opml\` (\`?category=<subject>\` for one subject)
  Every show in one OPML file, with feed URLs. One request rather than tens of thousands.

- **Add a show** — \`POST /api/submit\`
  JSON \`{"url": "<site or feed>"}\`, \`{"urls": [...]}\` (up to 50) or \`{"opml": "<opml>"}\`.
  A site URL works: the feed is found from the page. One URL is resolved in the call; a
  list is queued and \`statusUrl\` shows each land. A feed can be listed when its items
  carry audio, its host is not a paid hosting platform (Anchor is allowed), and it
  published inside the last 90 days; a refusal names the rule (\`rejected[].error\` and
  \`message\`). A feed that passes is NOT listed by the call: a person reviews it first,
  usually the same day, and the reply carries it as \`queued\` with \`review: [{url,
  feedUrl, title}]\` and the \`statusUrl\` to watch. \`accepted\` holds only shows already
  here. Twenty requests an hour per address. Reply: \`{ok, accepted: [{url, slug, page,
  existing}], rejected: [{url, error, message}], queued, total, submissionId, statusUrl,
  review?}\`. An OpenAccess bearer token (hub https://openaccess.logicsrc.com, scope
  \`podcasts:submit\`) records its principal as the submitter; \`submissions:review\`
  opens \`GET /api/review\` and \`POST /api/review/{id} {decision: approve|reject}\`.

## Limits worth knowing

- The directory hosts no audio. Every feed and episode URL points at the publisher.
- Metadata is read from publishers' feeds and can be stale or wrong.
- A show with no ISO 639-1 language code is reachable by subject and search, but has no
  language page.

Contact: hello@p0dcasters.com
`;

  return new Response(body, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
