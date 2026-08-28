#!/bin/sh
# Rebuild the directory, but only when Podcast Index actually publishes a new dump.
#
# Run from cron. A check costs one HEAD request; the full pipeline only runs when
# the dump has moved. This matters because rebuilding against an unchanged dump
# can only ever SHRINK the directory -- inclusion is "published within 90 days",
# so the cutoff slides forward and drops shows without adding replacements.
#
#   sh scripts/refresh-if-new-dump.sh          # check, and rebuild if new
#   FORCE=1 sh scripts/refresh-if-new-dump.sh  # rebuild even if unchanged
#   DRY_RUN=1 sh scripts/refresh-if-new-dump.sh
#
# Absolute paths throughout: cron gets a minimal PATH. The mise shims are used
# rather than the resolved binaries because they survive a runtime upgrade, and
# they work under `env -i`.
set -eu

DATA=/home/anthony/p0dcasters-data
STAMP=$DATA/.last-dump-stamp
LOG=$DATA/refresh.log
URL=https://public.podcastindex.org/podcastindex_feeds.db.tgz
UA='p0dcasters/1.0 (+https://p0dcasters.com)'

NODE=/home/anthony/.local/share/mise/shims/node
PY=/home/anthony/.local/share/mise/shims/python3
TURSO=/home/anthony/.turso/turso
export HOME=/home/anthony

# A build that yields fewer than this many rows is treated as broken, and prod is
# left alone. The directory has sat around 21.6k; a sudden collapse means the dump
# or a script changed shape, not that podcasting ended.
MIN_ROWS=${MIN_ROWS:-10000}

log() { echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*" >> "$LOG"; }
die() { log "FAILED: $*"; exit 1; }

cd "$DATA" || die "no $DATA"

# --- 1. has the dump moved? -------------------------------------------------
hdr=$(curl -sI -A "$UA" -m 60 "$URL") || die "HEAD request failed"
lm=$(printf '%s\n' "$hdr" | awk 'tolower($1)=="last-modified:"{sub(/^[^:]*: /,""); print; exit}' | tr -d '\r')
cl=$(printf '%s\n' "$hdr" | awk 'tolower($1)=="content-length:"{print $2; exit}' | tr -d '\r')
[ -n "$lm" ] && [ -n "$cl" ] || die "no last-modified/content-length in response headers"

sig="$lm|$cl"
prev=$(cat "$STAMP" 2>/dev/null || echo "none")

if [ "$sig" = "$prev" ] && [ "${FORCE:-0}" != "1" ]; then
  log "no new dump ($lm) -- nothing to do"
  exit 0
fi

log "new dump: $lm ($cl bytes); previous: $prev"
if [ "${DRY_RUN:-0}" = "1" ]; then log "(dry run, stopping before download)"; exit 0; fi

# --- 2. fetch + extract -----------------------------------------------------
# Download beside the real file and only move it into place once the size checks
# out, so an interrupted transfer cannot leave a truncated dump behind.
log "downloading ..."
curl -L -A "$UA" -m 3600 --retry 3 --retry-delay 30 -o podcastindex_feeds.db.tgz.part "$URL" \
  || die "download failed"
got=$(stat -c '%s' podcastindex_feeds.db.tgz.part)
[ "$got" = "$cl" ] || die "size mismatch: got $got, expected $cl"
mv podcastindex_feeds.db.tgz.part podcastindex_feeds.db.tgz
log "downloaded $got bytes; extracting ..."
tar -xzf podcastindex_feeds.db.tgz || die "extract failed"

# --- 3. build locally -------------------------------------------------------
log "building live subset ..."
"$PY" build_live.py >> "$LOG" 2>&1 || die "build_live.py failed"
log "building indie cut ..."
"$PY" export_indie.py >> "$LOG" 2>&1 || die "export_indie.py failed"

rows=$("$PY" -c "import sqlite3;print(sqlite3.connect('$DATA/p0dcasters.db').execute('SELECT COUNT(*) FROM podcasts').fetchone()[0])") \
  || die "could not count rows in the new build"
log "built $rows podcasts"
[ "$rows" -ge "$MIN_ROWS" ] || die "only $rows rows (< $MIN_ROWS) -- refusing to touch prod"

# --- 4. load into Turso -----------------------------------------------------
# Only past this point does prod change. load_turso.mjs inserts without
# truncating, so the tables are dropped first; the window is a few seconds.
TURSO_DATABASE_URL=$("$TURSO" db show p0dcasters --url) || die "turso db show failed"
TURSO_AUTH_TOKEN=$("$TURSO" db tokens create p0dcasters | tail -1) || die "turso token failed"
export TURSO_DATABASE_URL TURSO_AUTH_TOKEN

log "reloading Turso ..."
echo "DROP TABLE IF EXISTS podcasts_fts; DROP TABLE IF EXISTS podcasts;" \
  | "$TURSO" db shell p0dcasters >> "$LOG" 2>&1 || die "drop failed"
"$NODE" load_turso.mjs >> "$LOG" 2>&1 || die "load_turso.mjs failed (prod tables are dropped -- rerun with FORCE=1)"

remote=$(echo "SELECT COUNT(*) FROM podcasts;" | "$TURSO" db shell p0dcasters 2>/dev/null | tr -dc '0-9')
[ "$remote" = "$rows" ] || die "prod has $remote rows, expected $rows"

printf '%s' "$sig" > "$STAMP"
log "OK: $rows podcasts live (dump $lm)"
