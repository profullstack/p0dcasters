# p0dcasters

A directory of podcasts that live on their own domain.

Of the 4.7M feeds in the [Podcast Index](https://podcastindex.org), ~40% sit on Anchor
alone and the ten largest hosts carry about three quarters of everything. This lists the
remainder: **22,386 shows on 13,397 distinct domains**, each publishing from a domain its
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

## Rebuilding the data

```sh
python3 ../p0dcasters-data/export_indie.py    # writes p0dcasters.db
turso db shell p0dcasters < dump.sql
```
