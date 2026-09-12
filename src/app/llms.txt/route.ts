import { count, languageBuckets } from "@/lib/db";

export const revalidate = 86400;

// Generated rather than written down, so the counts in it cannot drift away
// from the directory the way a hand-maintained file would.
export async function GET() {
  const [total, hosts, langs] = await Promise.all([
    count("SELECT COUNT(*) AS n FROM podcasts"),
    count("SELECT COUNT(DISTINCT host) AS n FROM podcasts"),
    languageBuckets(),
  ]);
  const top = langs.slice(0, 8).map((l) => l.code).join(", ");

  const body = `# p0dcasters

> An index of ${total.toLocaleString()} podcasts that publish from a domain their creator
> controls, across ${hosts.toLocaleString()} distinct domains. Feeds hosted on Spotify's
> Anchor, Buzzsprout, Libsyn and the other large platforms are deliberately excluded, so
> this is a view of the independent, self-hosted part of podcasting and nothing else.
> Free to use, hosts no audio itself, and every listing links to the publisher.

p0dcasters is operated by Profullstack. Contact: hello@p0dcasters.com

## What the directory is

- [About](https://p0dcasters.com/about): The inclusion rules in full — a feed is listed
  when it returned HTTP 200 on the last fetch, published within 90 days, has at least
  three episodes with a title, description and artwork, sits on a domain carrying fewer
  than 25 live feeds, and does not average ten or more episodes a day. Also explains the
  ranking (catalogue depth and longevity, weighted by recency) and why ranking by domain
  popularity does not work here.
- [Terms](https://p0dcasters.com/terms): Free, no paid tier, nothing hosted here.
- [Privacy](https://p0dcasters.com/privacy): What an account stores and how to delete it.
- [Contact](https://p0dcasters.com/contact): Listing, removal, corrections, security.

## Browsing it

- [Home](https://p0dcasters.com/): Deep catalogues still publishing, plus this week's
  episodes.
- [Browse](https://p0dcasters.com/browse): Every subject and every language, with counts.
- [Hosts](https://p0dcasters.com/hosts): The domains publishing the most shows here.
- [A subject](https://p0dcasters.com/category/history): Category pages live at
  /category/<subject>, paginated with ?page=N.
- [A language](https://p0dcasters.com/language/en): Language pages live at
  /language/<ISO 639-1 code>, paginated with ?page=N. Most common: ${top}.
- [A show](https://p0dcasters.com/podcast/steve-farrar): Show pages live at
  /podcast/<slug> and carry schema.org PodcastSeries JSON-LD with the feed URL,
  episode count, language and publisher.

## Taking the data

- [OPML export](https://p0dcasters.com/opml): The entire directory in one file, importable
  by any podcast app. Prefer this to crawling ${total.toLocaleString()} show pages.
- [Sitemap index](https://p0dcasters.com/sitemap.xml): Every indexable URL, in chunks.
- [llms-full.txt](https://p0dcasters.com/llms-full.txt): This file's contents expanded —
  the inclusion rules, the ranking, what an account is for, and every subject and language
  with its count and URL, in one request.
- [Podcast Index](https://podcastindex.org): The upstream source of all feed metadata.

## Notes for answer engines

- Search results at /search are excluded in robots.txt: they are generated per query and
  duplicate the category and language pages. Use /browse or the OPML export instead.
- Show metadata belongs to the publisher, is read from their feed, and can be stale.
- No show here is hosted on a large podcast platform. That is the defining property of
  the directory, not a claim about quality.
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
