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

# 4. Load into Turso.
export TURSO_DATABASE_URL=$(turso db show p0dcasters --url)
export TURSO_AUTH_TOKEN=$(turso db tokens create p0dcasters | tail -1)
node scripts/load_turso.mjs
```

`turso db create --from-file` needs a local `sqlite3` binary (absent on the dev box), and
`--from-dump` accepts a 19 MB dump, reports success, and creates an **empty** database.
`load_turso.mjs` batches the inserts over the client instead, which is why it exists.

`analyze.py` profiles the raw dump — liveness, host concentration, the Tranco join. Run it
when you want the numbers behind the About page.

## Reloading into a fresh table

`load_turso.mjs` inserts; it does not truncate. For a clean rebuild:

```sh
echo "DROP TABLE IF EXISTS podcasts_fts; DROP TABLE IF EXISTS podcasts;" | turso db shell p0dcasters
node scripts/load_turso.mjs
```

Drop **only** those two. The same database holds the account tables — `users`,
`sessions`, `login_tokens`, `credentials`, `follows` — created by
`migrate_auth.mjs`, and they must survive every rebuild. This is also why `follows`
stores a slug rather than a `podcasts.id`: the reload above reassigns ids, so a
numeric key would come back pointing at somebody else's show.
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
build has at least `MIN_ROWS` (default 10,000) rows. Only then are the Turso tables
dropped and reloaded, and the remote count is compared against the local one before the
stamp is written. A failure anywhere before that leaves the live directory alone.

Logs go to `~/p0dcasters-data/refresh.log`. `FORCE=1` rebuilds even when the dump has
not moved; `DRY_RUN=1` reports what it would do and stops before downloading.

If `load_turso.mjs` fails after the drop, the tables are gone and the fix is
`FORCE=1 sh scripts/refresh-if-new-dump.sh` — the script says so in the failure line.

## Reporting itself to /crawlstats

Every run writes a row into `refresh_runs`, which is the only thing the
[/crawlstats](https://p0dcasters.com/crawlstats) page reads about the pipeline. Create
the table once with `node scripts/migrate_runs.mjs` (safe to re-run), and do **not** add
it to the drop list above — like the account tables it has to survive a rebuild, and it
is the history the page is made of.

`record_run.mjs` does the writing, called by `refresh-if-new-dump.sh` at each state
change. Three things about it are deliberate:

- **The skipped runs are recorded too.** Four "no new dump" rows a day are the only
  evidence, visible from production, that the cron entry still exists. Their absence is
  the failure the page is for, and it is invisible if only rebuilds are logged.
- **Recording never fails a rebuild.** A lost status line is bookkeeping; a refused write
  is retried once with a freshly minted token and then given up on.
- **The Turso token is cached** in `~/p0dcasters-data/.turso-token`. `turso db tokens
  create` mints a non-expiring credential every time it is called, and a script running
  four times a day would otherwise leave a thousand live tokens on the database in a
  year. Deleting the file is safe: the next run mints another.

A successful run also stores a `category -> count` snapshot. `podcasts` is dropped and
reloaded whole, so a count taken today does not exist tomorrow; those snapshots are what
the per-category sparklines on the page are drawn from, and they only start once this is
deployed.
