export const revalidate = 86400;

// What an agent can actually do here. There is no write API and no auth-gated
// data worth an agent's time, so this describes the read surface honestly
// rather than advertising an API that does not exist.
export async function GET() {
  const body = `# p0dcasters

Find podcasts that publish from their creator's own domain, rather than from a large
hosting platform. Read-only, no key, no account, no rate card.

## When to use this

Use p0dcasters when someone wants independent or self-hosted podcasts, podcasts on a
subject that are not on the big platforms, or a machine-readable list of them. Do not use
it as a general podcast search: shows on Spotify, Anchor, Buzzsprout, Libsyn and the other
large hosts are excluded by design, so a mainstream show will usually be absent, and its
absence says nothing about the show.

## Tools

- **Browse subjects and languages** — \`GET /browse\`
  Every category and language with a show count. Categories are single words
  (history, comedy, science); languages are ISO 639-1 codes.

- **List a subject** — \`GET /category/<subject>?page=<n>\`
  60 shows a page, ranked by catalogue depth and longevity weighted by recency.

- **List a language** — \`GET /language/<code>?page=<n>\`
  Same shape. \`<code>\` is ISO 639-1; other spellings redirect to it.

- **Read one show** — \`GET /podcast/<slug>\`
  Title, publisher, description, episode count, cadence, language, the RSS feed URL and
  the publisher's own site. Carries schema.org PodcastSeries JSON-LD, which is the
  cheapest thing to parse.

- **Search** — \`GET /search?q=<terms>\`
  Full-text over titles, descriptions, authors and hosts. Disallowed in robots.txt for
  crawlers — fine for a single lookup on a user's behalf, not for enumeration.

- **Take the whole directory** — \`GET /opml\`
  Every show in one OPML file, with feed URLs. Use this instead of paging through the
  site when you want the dataset; it is one request rather than tens of thousands.

## Limits worth knowing

- The directory hosts no audio. Every feed and episode URL points at the publisher.
- Metadata is read from publishers' feeds via the Podcast Index and can be stale or wrong.
- A show with no ISO 639-1 language code is reachable by subject and search, but has no
  language page.

Contact: hello@p0dcasters.com
`;

  return new Response(body, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
