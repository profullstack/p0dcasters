# p0dcasters

Every podcast with a feed — on any host.

The live part of the [Podcast Index](https://podcastindex.org) (about 9% of its 4.7M
feeds) plus the big network libraries that publish RSS: shows on their own domain, shows
on Anchor, Buzzsprout, Libsyn and every other host, and TWiT, NPR, BBC, CBC, ABC
Australia, PRX, Relay FM and the other networks. Hundreds of thousands of shows.

## Inclusion rules

Any host qualifies. A feed is listed when it:

- returned HTTP 200 on the last fetch and published within 90 days;
- has 3+ episodes plus a title, description and artwork;
- is not a bulk-dump content farm (10+ episodes/day averaged over its lifetime).

Near-identical copies of one feed on the same host are collapsed.

## Platforms, networks, self-hosted

- A domain carrying 25+ live feeds is a **hosting platform** (`platform_hosts`, measured
  at every rebuild). It is a label on the show ("Hosted on Buzzsprout"), not a filter.
  Until 2026-10 it was the filter: the directory listed only the shows below that line.
- Those shows, on their creator's own domain, are still listed together at `/self-hosted`.
- `/networks` groups the broadcasters and podcast networks whose whole library is RSS,
  each at `/networks/<slug>`.

## Why popularity ranking is not used

93% of live feeds sit on a domain in the global top million, because they are on the same
twenty platforms. Domain popularity measures the platform, never the show, and would bury
every show on its own small domain. Shows are ordered by catalogue depth and longevity,
weighted by recency.

## Stack

Next.js (App Router) on Node, Postgres through
[`@profullstack/libsql-pg`](https://github.com/profullstack/libsql-pg), which keeps the
`@libsql/client` surface the queries were written against. The schema is
`db/schema.pg.sql`. Search is a weighted tsvector expression index (`p0d_search_vector`);
raw input is tokenised before it reaches `to_tsquery`, which treats punctuation as query
syntax and would otherwise 500.

## Listening

Every show page carries its full episode list, read live from the publisher's own feed
and cached for half an hour — nothing about episodes is stored here. Playing one hands it
to a player that lives in the root layout and keeps running while you move around the
site, which is why **every internal link is a `next/link`**: a plain `<a href>` reloads
the document and takes the audio with it.

About 8% of the directory still serves its mp3s over plain `http`, which a browser on an
`https` page refuses to play and no CSP can permit. Those go through `/api/audio`, which
streams them over TLS with `Range` passed through in both directions. The URL is
HMAC-signed with `AUTH_SECRET` so the route cannot be used as an open proxy.

A publisher's feed is the slowest thing on a show page, so the episode list is wrapped in
`<Suspense>` and streams in behind the rest of the page: first byte stays ~100ms whether
the feed answers in 200ms or nine seconds.

## Accounts

Emailed magic link plus passkeys, the house pattern — there is no password. Opening the
link *is* the registration, so an unknown address makes the account; `/signup` and
`/login` are the same component with different wording. The endpoint answers "if that
address can receive mail, a link is on its way" whether or not the address is known,
whether it was rate limited, and even when Resend is down, so it cannot be used to
enumerate who has an account.

Signed-in state is fetched from `/api/me` in the browser rather than read from cookies in
the root layout. A single `cookies()` call there would opt every show page out of
static rendering.

Every table is created by `db/schema.pg.sql` (idempotent; `psql "$DATABASE_URL" -f
db/schema.pg.sql`). The account tables live in the same Postgres database as
`podcasts` but the directory rebuild never touches them, and
`follows` keys shows by **slug** — the reload reassigns `podcasts.id`, so a numeric key
would silently repoint everyone's follows at other shows.

### Environment

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | the database, `postgres://...`; the app refuses to start on anything else (schema: `db/schema.pg.sql`) |
| `AUTH_SECRET` | session and audio-proxy signing. **Required in production** |
| `RESEND_API_KEY` | sending the magic link. Without it, outside production, the link is printed to the console instead |
| `SUBMIT_FORWARD_TO` | where `/api/submit` also sends a listed feed. Defaults to `https://rssamplifier.com` in production; set it empty to stop forwarding |
| `ADMIN_EMAILS` | comma-separated addresses that may review submissions at `/admin/submissions` and get an email per submission. Defaults to the operator's address in `src/lib/review.ts` |
| `CRAWLER_TOKENS` | comma-separated `name:token` pairs for our own crawlers. A `POST /api/submit` with header `x-crawler-token: <token>` is recorded as `submitted_by = crawler:<name>`, skips the hourly per-address limit, and a feed that passes the rules is listed at once (no review queue, no admin email). Everything else still waits for review |
| `COINPAY_X402_KEY`, `CRAWL_PAY_TO` | selling crawl access to AI training crawlers (see below). Until both are set, training crawlers get `402` with an empty offer: nothing is sold, nothing is given away |

## Rebuilding the data

```sh
python3 ../p0dcasters-data/export_indie.py    # writes p0dcasters.db (the whole live catalogue, every host; the name is historical)
DATABASE_URL=postgres://... node scripts/load_directory.mjs
```

## Data-quality fixes applied

- **Duplicate listings.** Collapsed entries sharing domain + title + episode count +
  latest episode — sites that publish per-category feeds emit a dozen with identical
  metadata. Deliberately *not* keyed on (host, title) alone: some stations run many
  distinct programmes under one generic title.
- **Bare public-suffix hosts.** The Podcast Index `host` column sometimes holds `co.nz` or
  `com.br` rather than the registrable domain, which both mis-attributes the show and
  duplicates it under a second "host". Re-derived from the feed URL.

## Crawl status

`/crawlstats` is the status board for the pipeline above, with `/api/crawlstats` as the
same figures in JSON. It exists because that pipeline can die without anything looking
wrong: the site keeps serving, the shows are all still there, and they quietly describe a
directory that stopped being true weeks ago. Nothing about that is visible from outside.

The page answers four questions — is the cron check still running, when did a rebuild last
land, what did it change, and how much of the directory is drifting towards the 90-day
cutoff — plus a freshness histogram, per-category sizes with a sparkline per row, the most
recently published shows, and the ones closest to being dropped.

Two things shape how it is built:

- **The health badge reads the check, not the rebuild.** A fortnight without a rebuild is
  normal, because Podcast Index had not republished. A day without a *check* is not, and
  it is the only outage this page can detect on its own.
- **It is uncached, and every relative figure is derived at render.** Caching an object
  holding "last checked 20 minutes ago" freezes that sentence, and a page that reports a
  dead pipeline as cheerfully current is worse than no page. The reads are one batch
  each, so the cost is a round trip per batch. (It was written for a 21k-row directory;
  re-check the render time now that the directory holds every host.)

Its history comes from `refresh_runs`, written by the pipeline itself — see
`scripts/README.md`. The table is part of `db/schema.pg.sql`, and do **not**
add it to the rebuild's drop list: like the account tables it has to survive a reload,
because it is the only record of anything that happened before the current directory
existed.

## AI crawlers

Two kinds of AI crawler visit and only one sends a listener back. Retrieval crawlers
(OAI-SearchBot, Claude-SearchBot, PerplexityBot, Applebot, Amazonbot, DuckAssistBot, ...)
feed the live index that AI answers cite from, and a citation is a link to a show page:
they read free, like people and Googlebot. Training crawlers (GPTBot, ClaudeBot, CCBot,
meta-externalagent, Bytespider, Applebot-Extended, ...) copy pages into a corpus and cite
nothing back; Meta's alone was a third of one week's hits. Those pay.

`src/middleware.ts` runs [`@profullstack/x402-gateway`](https://github.com/profullstack/x402-gateway):
a training crawler gets `402 Payment Required` with an x402 offer ($1 buys a day, USDC,
settled by CoinPay) or the sales page at `/crawl` if it asked for HTML; a paid pass in the
`x-crawl-pass` header lets it through. `robots.txt` is generated from the same lists in
`src/lib/crawl-gateway.ts`, so the two cannot disagree: training crawlers get
`Disallow: /` plus `Allow: /crawl`, retrieval crawlers are named and allowed. `/llms.txt`
and `/skill.md` stay readable to a refused crawler so the refusal is legible.

The lists catch crawlers that say who they are. Two controls in `src/lib/crawl-gateway.ts`
cover the ones that do not: OVH's VPS ranges (a fleet seen wearing "Chrome/148" on
rssamplifier, 2026-08-28) get a tiny `403` before anything else runs, and a request that
claims `Chrome/…` but sends no `Sec-Fetch-Mode` (a header every Chromium sends and nothing
can strip) is charged like GPTBot. A crawler that declares itself, Googlebot's evergreen
string included, is judged by the lists alone. A request carrying the `p0d_session` cookie
is never charged.
