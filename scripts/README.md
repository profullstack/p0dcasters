# Refreshing the directory

The Podcast Index dump is regenerated roughly weekly. Because inclusion depends on
"published within 90 days", the directory goes stale if it is never rebuilt — shows that
stopped publishing keep being listed as live.

Full refresh:

```sh
cd ~/p0dcasters-data

# 1. Fetch the dump. A generic User-Agent gets a 403 by policy — identify the app.
curl -L -A 'p0dcasters/1.0 (+https://p0dcasters.com)' \
  -o podcastindex_feeds.db.tgz https://public.podcastindex.org/podcastindex_feeds.db.tgz
tar -xzf podcastindex_feeds.db.tgz          # -> podcastindex_feeds.db (4.8 GB)

# 2. Live subset (lastHttpStatus=200 AND published <= 90d).
#    The dump's own `dead` column is 0 on every row and cannot be used.
python3 scripts/build_live.py               # -> p0dcasters_live.db

# 3. Indie cut + scoring + FTS.
python3 scripts/export_indie.py             # -> p0dcasters.db

# 4. Load into Postgres. The site's own DATABASE_URL, from the vault.
logicsrc teams pull profullstack p0dcasters prod --env /tmp/p0d.env
export $(grep -E '^DATABASE_URL=' /tmp/p0d.env | xargs)
node scripts/load_directory.mjs
```

`load_directory.mjs` streams the rows over the client in multi-row inserts (the
database is on another box; a statement per row would be a round trip per row).

`analyze.py` profiles the raw dump — liveness, host concentration, the Tranco join. Run it
when you want the numbers behind the About page.

## How the reload keeps prod serving

`load_directory.mjs` never drops the live table first. It stages every row into
`podcasts_new` while `podcasts` keeps serving, then swaps in one write transaction:
drop the old table, rename the staged table into place, recreate the indexes
(including the search index). A failure before the swap leaves prod untouched; a
failure inside it rolls back. A `podcasts_new` left by a crash is dropped on the
next attempt. There is no longer a "tables are dropped, rerun with FORCE=1" state.

The same database holds the account tables — `users`, `sessions`, `login_tokens`,
`credentials`, `follows` — plus `refresh_runs` and `submissions`, plus `podcast_profiles`
and `profile_sources` (what a podcaster corrected on their OpenProfile.md and who
claimed it, keyed by slug for the same reason `follows` is); all of them come from
`db/schema.pg.sql`. The loader drops none of them. It does
*read* `submissions`: a show a publisher added through `/submit` was inserted into
`podcasts` at the time, and the row is kept as JSON on the submission, so before the
swap the loader re-reads each such feed (bounded, best effort), then inserts the ones
the dump does not already carry into `podcasts_new` — unless the show has aged past
the same 90-day rule as everything else. Where the dump now carries the feed, the
dump's row wins and the submission's slug is kept on it so follows and links survive.
`platform_hosts` (written by `export_indie.py`, the 25-feeds-per-host cut) is staged
and swapped like `podcasts`; it is what `/api/submit` refuses platform feeds with.
`anchor.fm` is deleted from that cut on purpose (`ALLOWED_PLATFORMS` in
`export_indie.py`, mirrored in `src/lib/platforms.ts`, since 2026-09-13), which is why
the directory is ~5x the size it was before that date. A submission is not listed by
the loader until a person has approved it: only rows in status `listed` are merged, and
`review` rows wait in the queue at `/admin/submissions`. This is also why `follows` stores a slug rather than a
`podcasts.id`: the reload reassigns ids, so a numeric key would come back pointing
at somebody else's show.

`db_sql.mjs` runs one statement with the same credentials (`node
scripts/db_sql.mjs "SELECT COUNT(*) FROM podcasts"`, `--rows` for TSV, `--file` to
apply a SQL file); it is what the refresh script uses.
## Automatic refresh

`refresh-if-new-dump.sh` does the whole thing above, but only when Podcast Index has
actually published a new dump. It runs from cron every 6 hours:

```
0 */6 * * * /bin/sh /home/anthony/p0dcasters/scripts/refresh-if-new-dump.sh
```

A check is one HEAD request. It compares `last-modified` + `content-length` against
`~/p0dcasters-data/.last-dump-stamp` and exits immediately when they match, so the
expensive path runs roughly weekly rather than four times a day.

**Why it is conditional rather than just scheduled.** Inclusion is "published within
90 days", recomputed at build time. Rebuilding against a dump you have already
processed only slides the cutoff forward: it drops shows that have gone quiet and adds
nothing. A plain nightly rebuild would erode the directory a few shows at a time. Run
on 2026-08-28 against an unchanged dump, it cut 21 of 21,628.

It is ordered so prod is the last thing touched: download (to a `.part` file, moved into
place only after the length matches), extract, build both databases, then check the new
build has at least `MIN_ROWS` (default 10,000) rows. Only then does the loader stage and
swap, and the remote count is compared against the local one before the stamp is
written. A failure anywhere leaves the live directory alone.

Logs go to `~/p0dcasters-data/refresh.log`. `FORCE=1` rebuilds even when the dump has
not moved; `DRY_RUN=1` reports what it would do and stops before downloading.

### Recovering on its own

The pipeline stalled for nine days in September 2026 without a single failing command:
the Turso CLI's browser login had expired, and it answers "You are not logged in" on
stdout with exit status 0, so `turso db show --url` handed the loader a sentence as a
URL and `turso db shell` "succeeded" at dropping nothing. What changed:

- **No CLI in the pipeline.** The credential is the database URL itself. The script
  takes the first one the database actually accepts: `DATABASE_URL` in the environment,
  the cached `~/p0dcasters-data/.database-url`, then the `p0dcasters--prod` vault via
  `logicsrc`. A rejected URL is discarded and the chain re-walked, so a rotated password
  heals on the next run.
- **One run at a time.** `flock` on `~/p0dcasters-data/.refresh.lock`; an overlapping
  tick exits at once. Cron wraps the run in `timeout 3h`.
- **Retries are cheap.** The dump stamp only advances on success, so a failed run is
  retried at the next tick, and a dump already downloaded and extracted for the same
  upstream signature is not fetched again.
- **Nothing is left half-reported.** Every exit path records a status, and the next
  run's first write closes out any row still marked `running` as failed, so the page
  never shows a phantom run for days.
- **A watchdog reads the page.** `crawlstats-watchdog.sh` runs hourly from cron, polls
  `/api/crawlstats`, and if `health.state` is anything but `healthy` it re-runs the
  refresh once and checks again. If the page still is not healthy it emails
  `anthony@profullstack.com` through Resend (key from the same vault, cached in
  `.resend-key`), at most once every 12 hours, with the tail of `refresh.log`.

```
0 */6 * * * /usr/bin/timeout -k 60 3h /bin/sh /home/anthony/p0dcasters/scripts/refresh-if-new-dump.sh
30 * * * *  /bin/sh /home/anthony/p0dcasters/scripts/crawlstats-watchdog.sh
```

The scripts run from the checkout they live in, so `~/p0dcasters` must be pulled for a
merged fix to reach the directory; the copies that used to sit in `~/p0dcasters-data`
are no longer used.

## Reporting itself to /crawlstats

Every run writes a row into `refresh_runs`, which is the only thing the
[/crawlstats](https://p0dcasters.com/crawlstats) page reads about the pipeline. The
table is part of `db/schema.pg.sql`; do **not** add it to the drop list above — like the
account tables it has to survive a rebuild, and it is the history the page is made of.

`record_run.mjs` does the writing, called by `refresh-if-new-dump.sh` at each state
change. Three things about it are deliberate:

- **The skipped runs are recorded too.** Four "no new dump" rows a day are the only
  evidence, visible from production, that the cron entry still exists. Their absence is
  the failure the page is for, and it is invisible if only rebuilds are logged.
- **Recording never fails a rebuild.** A lost status line is bookkeeping; a refused write
  is retried once with a freshly pulled URL and then given up on.
- **The database URL is cached** in `~/p0dcasters-data/.database-url` so the vault is
  not pulled four times a day. Deleting the file is safe: the next run pulls it again.

A successful run also stores a `category -> count` snapshot. `podcasts` is dropped and
reloaded whole, so a count taken today does not exist tomorrow; those snapshots are what
the per-category sparklines on the page are drawn from, and they only start once this is
deployed.
