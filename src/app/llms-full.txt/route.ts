import { cachedDb } from "@/lib/cached-db";
import { titleCase, languageName } from "@/lib/format";

const { count, languageBuckets, all } = cachedDb(86400);

// Rendered per request, not at build: the build must not need the database.
// The reads are memoised for 86400 s (the old ISR window) in lib/cached-db.
export const dynamic = "force-dynamic";

/**
 * llms.txt is the index; this is the body behind it — the whole orienting text
 * of the site in one request, so a model does not have to fetch /about, then
 * /terms, then /privacy, then guess at the taxonomy.
 *
 * Everything numeric is queried rather than typed in. A hand-written copy of
 * the About page would be correct on the day it was written and quietly wrong
 * a month later, which is worse than not publishing one: this file exists to
 * be quoted.
 *
 * Deliberately not the full 21k listings. That is what the OPML export is for,
 * and it is linked below; concatenating the directory here would be a 20 MB
 * response that no context window wants and the sitemap already enumerates.
 */
export async function GET() {
  const [total, hosts, episodes, langs, cats] = await Promise.all([
    count("SELECT COUNT(*) AS n FROM podcasts"),
    count("SELECT COUNT(DISTINCT host) AS n FROM podcasts"),
    count("SELECT SUM(episode_count) AS n FROM podcasts"),
    languageBuckets(),
    all<{ category: string; n: number }>(
      `SELECT category, COUNT(*) AS n FROM podcasts
       WHERE category IS NOT NULL AND category != ''
       GROUP BY category ORDER BY n DESC`,
    ),
  ]);

  const catLines = cats
    .map(
      (c) =>
        `- ${titleCase(c.category)} — ${Number(c.n).toLocaleString()} shows — ` +
        `https://p0dcasters.com/category/${encodeURIComponent(c.category)}`,
    )
    .join("\n");

  const langLines = langs
    .slice(0, 30)
    .map(
      (l) =>
        `- ${languageName(l.code)} (${l.code}) — ${Number(l.n).toLocaleString()} shows — ` +
        `https://p0dcasters.com/language/${l.code}`,
    )
    .join("\n");

  const body = `# p0dcasters — full text

> Generated ${new Date().toISOString().slice(0, 10)}. Every number below is read from the
> directory at request time, so this file and the site cannot disagree.

## What this is

p0dcasters is a directory of ${total.toLocaleString()} live podcasts with an RSS feed, on
any host, spread across ${hosts.toLocaleString()} distinct domains and
${episodes.toLocaleString()} episodes between them.

Podcasting is an open format: an RSS feed at a URL. That holds wherever the feed lives —
on the creator's own domain, on a hosting platform such as Anchor, Buzzsprout or Libsyn,
or in a broadcaster's library such as TWiT, NPR, the BBC, CBC or ABC Australia. Most of
the feeds in the Podcast Index are dead; this directory is the part still publishing.

It is free, has no paid tier, and hosts no audio: every listing links to the publisher's
feed. It is operated by Profullstack. Contact: hello@p0dcasters.com

## What gets in

Any host qualifies. Starting from the Podcast Index public database and the networks' own
published feed lists, a feed is listed when it:

- returned HTTP 200 on the last fetch, and published within the last 90 days;
- has at least three episodes, plus a title, description and artwork;
- isn't a bulk-dump content farm — feeds averaging ten or more episodes a day over their
  lifetime are left out.

Near-identical copies of the same feed on one host are collapsed into one.

## Platforms, networks, self-hosted

- A domain carrying 25 or more live feeds in the Podcast Index is labelled a hosting
  platform, and its shows say "Hosted on <platform>". The threshold is measured at every
  rebuild. It decides nothing about whether a show is listed.
- A show on a domain below that line is self-hosted. All of them:
  https://p0dcasters.com/self-hosted
- Broadcasters and podcast networks that publish their library as RSS are grouped at
  https://p0dcasters.com/networks, each at /networks/<slug>.

## How it is ordered

Shows are ranked by catalogue depth and longevity, weighted by recency — not by raw recency
alone, and not by popularity. Ranking by domain popularity would measure the platforms'
traffic rather than the shows, and bury every show on its own small domain.

## What an account is for

Accounts are free and optional. An account exists only so you can follow shows and see new
episodes from the ones you follow. Sign-in is by emailed magic link or passkey — there is no
password to store. Nothing is sold, and there is no advertising profile built from it. Full
detail: https://p0dcasters.com/privacy

## Subjects

${catLines}

## Languages

The language is whatever the publisher declares in their own feed, folded onto its ISO 639-1
code — so "eng", "en_US" and "English" all resolve to /language/en.

${langLines}

Every language, with counts: https://p0dcasters.com/browse

## Taking the data

- OPML export — the entire directory in one file, importable by any podcast app:
  https://p0dcasters.com/opml
  Prefer this to crawling ${total.toLocaleString()} show pages.
- Sitemap index — every indexable URL, in chunks: https://p0dcasters.com/sitemap.xml
- Show pages carry schema.org PodcastSeries JSON-LD with the feed URL, episode count,
  language and publisher: https://p0dcasters.com/podcast/<slug>
- Upstream source of all feed metadata: https://podcastindex.org

## Caveats worth quoting accurately

- Show metadata belongs to the publisher, is read from their feed, and can be stale.
- /search is disallowed in robots.txt: results are generated per query and duplicate the
  category and language pages. Use /browse or the OPML export.
- "Self-hosted" and "Hosted on <platform>" are statements about where a feed lives, not
  judgements about the show.
- A show that has not published in 90 days is not listed, wherever it is hosted.

## Pages

- https://p0dcasters.com/ — home
- https://p0dcasters.com/about — inclusion rules, ranking, data source
- https://p0dcasters.com/browse — every subject and language, with counts
- https://p0dcasters.com/networks — broadcasters and podcast networks, by library
- https://p0dcasters.com/self-hosted — only the shows on their creator's own domain
- https://p0dcasters.com/hosts — the domains publishing the most shows here
- https://p0dcasters.com/crawlstats — what the pipeline behind the directory is doing
- https://p0dcasters.com/contact — listing, removal, corrections, security
- https://p0dcasters.com/privacy — what an account stores and how to delete it
- https://p0dcasters.com/terms — free, no paid tier, nothing hosted here
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
