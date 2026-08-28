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
