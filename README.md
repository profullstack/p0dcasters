# p0dcasters

A directory of podcasts that live on their own domain.

Of the 4.7M feeds in the [Podcast Index](https://podcastindex.org), ~40% sit on Anchor
alone and the ten largest hosts carry about three quarters of everything. This lists the
remainder: **21,628 shows on 13,408 distinct domains**, each publishing from a domain its
creator controls.

## Inclusion rules

A feed is listed when it:

- returned HTTP 200 on the last fetch and published within 90 days;
- is **not** on a hosting platform or broadcaster — any domain carrying 25+ live feeds
  (308 domains, including every major host);
- has 3+ episodes plus a title, description and artwork;
- is not a bulk-dump content farm (10+ episodes/day averaged over its lifetime).

## Why popularity ranking is not used

93% of live feeds already sit on a domain in the global top million, because they are all
on the same twenty platforms. Domain popularity measures the platform, never the show, and
the domains *absent* from those rankings are precisely the independent ones. It is used
here only inverted, as one signal for identifying platforms to exclude.

## Stack

Next.js (App Router) on Node, Turso/libSQL, deployed on Railway. Search is SQLite FTS5;
raw input is tokenised before it reaches `MATCH`, since FTS5 treats punctuation as query
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
the root layout. A single `cookies()` call there would opt all 22k show pages out of
static rendering.

Create the tables with `node scripts/migrate_auth.mjs` (safe to re-run). They live in the
same Turso database as `podcasts` but the directory rebuild never touches them, and
`follows` keys shows by **slug** — the reload reassigns `podcasts.id`, so a numeric key
would silently repoint everyone's follows at other shows.

### Environment

| Variable | Needed for |
| --- | --- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | the database; falls back to `./data/p0dcasters.db` |
| `AUTH_SECRET` | session and audio-proxy signing. **Required in production** |
| `RESEND_API_KEY` | sending the magic link. Without it, outside production, the link is printed to the console instead |

## Rebuilding the data

```sh
python3 ../p0dcasters-data/export_indie.py    # writes p0dcasters.db
turso db shell p0dcasters < dump.sql
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
  dead pipeline as cheerfully current is worse than no page. The reads are one libSQL
  batch each and the directory is 21k rows, so this costs a round trip, not a scan.

Its history comes from `refresh_runs`, written by the pipeline itself — see
`scripts/README.md`. Create the table with `node scripts/migrate_runs.mjs`, and do **not**
add it to the rebuild's drop list: like the account tables it has to survive a reload,
because it is the only record of anything that happened before the current directory
existed.
