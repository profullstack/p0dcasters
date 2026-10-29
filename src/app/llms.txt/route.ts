import { cachedDb } from "@/lib/cached-db";

const { count, languageBuckets } = cachedDb(86400);

// Rendered per request, not at build: the build must not need the database.
// The reads are memoised for 86400 s (the old ISR window) in lib/cached-db.
export const dynamic = "force-dynamic";

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

> An index of ${total.toLocaleString()} live podcasts with an RSS feed, on any host,
> across ${hosts.toLocaleString()} distinct domains: shows on their own domain, shows on
> Anchor, Buzzsprout, Libsyn and the other hosting platforms, and the big network
> libraries (TWiT, NPR, BBC, CBC, ABC Australia, PRX, Relay FM and others). Free to use,
> hosts no audio itself, and every listing links to the publisher.

p0dcasters is operated by Profullstack. Contact: hello@p0dcasters.com

## What the directory is

- [About](https://p0dcasters.com/about): The inclusion rules in full — a feed is listed
  when it returned HTTP 200 on the last fetch, published within 90 days, has at least
  three episodes with a title, description and artwork, and does not average ten or more
  episodes a day. Any host qualifies; a domain carrying 25 or more live feeds is labelled a
  hosting platform, which decides nothing about listing. Also explains the ranking
  (catalogue depth and longevity, weighted by recency) and why ranking by domain
  popularity does not work here.
- [Terms](https://p0dcasters.com/terms): Free, no paid tier, nothing hosted here.
- [Privacy](https://p0dcasters.com/privacy): What an account stores and how to delete it.
- [Contact](https://p0dcasters.com/contact): Listing, removal, corrections, security.

## Browsing it

- [Home](https://p0dcasters.com/): Deep catalogues still publishing, plus this week's
  episodes.
- [Browse](https://p0dcasters.com/browse): Every subject and every language, with counts.
- [Podcasts](https://p0dcasters.com/podcasts): The podcast catalogue's front page: subjects,
  languages and the deepest shows still publishing.
- [Radio](https://p0dcasters.com/radio): Internet radio stations streaming now (radio-browser.info
  via nichedb.dev), most listened first; filter with ?country=<cc>&genre=<genre>&q=<name>.
- [TV](https://p0dcasters.com/tv): Television channels with an open live stream (iptv-org via
  nichedb.dev), each watchable at /tv/<channel-id>; filter with ?country=<cc>&category=<c>.
- [Networks](https://p0dcasters.com/networks): The broadcasters and podcast networks that
  publish their library as RSS, each at /networks/<slug>.
- [Self-hosted](https://p0dcasters.com/self-hosted): Only the shows that publish from a
  domain their creator controls, not a hosting platform.
- [Hosts](https://p0dcasters.com/hosts): The domains publishing the most shows here.
- [A subject](https://p0dcasters.com/category/history): Category pages live at
  /category/<subject>, paginated with ?page=N.
- [A language](https://p0dcasters.com/language/en): Language pages live at
  /language/<ISO 639-1 code>, paginated with ?page=N. Most common: ${top}.
- [A show](https://p0dcasters.com/podcast/steve-farrar): Show pages live at
  /podcast/<slug> and carry schema.org PodcastSeries JSON-LD with the feed URL,
  episode count, language and publisher.
- [The podcaster](https://p0dcasters.com/podcast/steve-farrar/openprofile.md): Every show
  serves the person behind it as an OpenProfile.md (logicsrc.com/openprofile) with the
  Broadcast section (logicsrc.com/openbroadcast), at /podcast/<slug>/openprofile.md and
  linked from the show page with rel="openprofile". Generated from the feed, enriched
  from rssamplifier.com, corrected by the person once they claim it at
  /podcast/<slug>/profile. All of them, newest change first, at
  /api/openprofiles?since=&limit=&cursor= for a directory that pulls.

## Adding a show

- [Submit](https://p0dcasters.com/submit): Paste a podcast's site or feed URL; the feed is
  found and checked against the inclusion rules at once, and a person lists it after a
  look, usually the same day. No account.
- [POST /api/submit](https://p0dcasters.com/api/submit): The same as JSON —
  {"url": "..."} or {"urls": [...]} or {"opml": "..."} — answering
  {ok, accepted, rejected, queued, statusUrl, review}. A feed that passes comes back in
  review (and counted in queued), not accepted, until a person lists it. Twenty requests
  an hour per address. An OpenAccess bearer token (hub https://openaccess.logicsrc.com,
  scope podcasts:submit) records its principal as the submitter; scope
  submissions:review opens GET /api/review, POST /api/review/{id} and POST /api/review {decision: approve} (accept all waiting, or only ids).
- [MCP](https://p0dcasters.com/mcp): search, get_podcast, list_episodes, list_shows,
  browse, directory_stats, submit_feed, get_openprofile, update_openprofile,
  claim_openprofile, get_newsletter and newsletter_preview at
  https://p0dcasters.com/api/mcp, no key (the two profile writes take an OpenAccess
  bearer with scope openprofile:edit).
- [CLI](https://p0dcasters.com/cli): \`curl -fsSL https://p0dcasters.com/install.sh | sh\`
  installs \`p0d\`: search, show, episodes, submit, opml, profile, newsletter.
- [OpenAPI](https://p0dcasters.com/openapi.json): Every JSON endpoint, described.

## The weekly digest

- [Newsletter](https://p0dcasters.com/newsletter): One email a week to every account,
  Fridays at 15:00 UTC: the shows that joined the directory, the most followed that week,
  long-running shows that published, the busiest networks. On by default, off from
  /account or the one-click link (RFC 8058 List-Unsubscribe) in every issue. No ads.
- [GET /api/v1/newsletter](https://p0dcasters.com/api/v1/newsletter): The schedule, the
  next send time and the latest issue.
- [GET /api/v1/newsletter/preview](https://p0dcasters.com/api/v1/newsletter/preview): This
  week's issue as it would be built now (subject, HTML, text). Signed in,
  GET/PUT /api/v1/me/newsletter reads or sets {"subscribed": true|false}.

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
- Shows on every host are listed. "Hosted on <platform>" on a show page is a measured
  label (25+ live feeds on the domain), and "self-hosted" means the feed is on a domain
  below that line. Neither is a claim about quality.
- A show is listed only while it is publishing: no episode in 90 days and it drops out.
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
