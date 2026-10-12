export const revalidate = 86400;

// What an agent can actually do here: the read surface, and the one write.
export async function GET() {
  const body = `# p0dcasters

Find any live podcast with an RSS feed — on its own domain, on a hosting platform, or in a
network's library — and add one. No key, no account, no rate card.

## When to use this

Use p0dcasters when someone wants podcasts on a subject or in a language, a show's feed
URL or episodes, a machine-readable list of shows (OPML), the shows of a network such as
TWiT, NPR or the BBC (\`/networks\`), only self-hosted shows (\`/self-hosted\`), or when
someone wants their show listed. Shows on every host are here; a show is absent when it
has no public RSS feed or has not published in 90 days.

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
  Every show in one OPML file, with feed URLs. One request rather than hundreds of thousands.

- **Add a show** — \`POST /api/submit\`
  JSON \`{"url": "<site or feed>"}\`, \`{"urls": [...]}\` (up to 50) or \`{"opml": "<opml>"}\`.
  A site URL works: the feed is found from the page. One URL is resolved in the call; a
  list is queued and \`statusUrl\` shows each land. A feed can be listed when its items
  carry audio and it published inside the last 90 days, on any host; a refusal names the rule (\`rejected[].error\` and
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
