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
#
# Every run also records itself into the `refresh_runs` table, which is what
# /crawlstats shows. That includes the runs that do nothing: four "skipped" rows
# a day are the only evidence from production that this cron entry still exists,
# and their absence is precisely the silent failure the page exists to catch.
# Recording is best effort -- a lost status line never fails a rebuild.
set -eu

DATA=/home/anthony/p0dcasters-data
REPO=/home/anthony/p0dcasters
STAMP=$DATA/.last-dump-stamp
LOG=$DATA/refresh.log
TOKENF=$DATA/.turso-token
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

# This run's identity and its own slice of the log. The shared refresh.log is
# append-only across every run ever; RUNLOG holds just this one, so the page can
# show a run's log beside that run.
RUN_KEY=$(date -u '+%Y%m%dT%H%M%SZ')-$$
STARTED=$(date -u '+%s')
RUNLOG=$(mktemp "${TMPDIR:-/tmp}/p0d-refresh.XXXXXX")
STEP=check
trap 'rm -f "$RUNLOG"' EXIT

log() {
  line="$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
  echo "$line" >> "$LOG"
  echo "$line" >> "$RUNLOG"
}

# Turso credentials for the node scripts. The token is cached rather than minted
# per run: `turso db tokens create` issues a non-expiring token every time it is
# called, and a cron entry running four times a day would otherwise leave a
# thousand live credentials on the database in a year. record() re-mints on a
# write failure, so a revoked cached token heals itself on the next run.
turso_env() {
  [ -n "${TURSO_DATABASE_URL:-}" ] && [ -n "${TURSO_AUTH_TOKEN:-}" ] && return 0
  TURSO_DATABASE_URL=$("$TURSO" db show p0dcasters --url) || return 1
  if [ -s "$TOKENF" ]; then
    TURSO_AUTH_TOKEN=$(cat "$TOKENF")
  else
    TURSO_AUTH_TOKEN=$("$TURSO" db tokens create p0dcasters | tail -1) || return 1
    (umask 077; printf '%s' "$TURSO_AUTH_TOKEN" > "$TOKENF")
  fi
  export TURSO_DATABASE_URL TURSO_AUTH_TOKEN
  return 0
}

# Write this run's state to `refresh_runs`. Never fails the caller and never
# calls die() -- it is reached *from* die(), and a loop there would turn a
# reportable failure into a hang.
record() {
  set +e
  turso_env
  if [ $? -ne 0 ]; then set -e; return 0; fi

  "$NODE" "$REPO/scripts/record_run.mjs" \
    --key "$RUN_KEY" --started "$STARTED" --log "$RUNLOG" "$@" >/dev/null 2>&1
  if [ $? -eq 3 ]; then
    # Exit 3 is "the write was rejected"; a stale cached token is the likeliest
    # cause, so throw it away and try once with a fresh one.
    rm -f "$TOKENF"
    unset TURSO_AUTH_TOKEN
    turso_env && "$NODE" "$REPO/scripts/record_run.mjs" \
      --key "$RUN_KEY" --started "$STARTED" --log "$RUNLOG" "$@" >/dev/null 2>&1
  fi
  set -e
  return 0
}

die() {
  log "FAILED: $*"
  record --status failed --step "$STEP" --message "$*"
  exit 1
}

cd "$DATA" || die "no $DATA"

record --status running --step check

# --- 1. has the dump moved? -------------------------------------------------
hdr=$(curl -sI -A "$UA" -m 60 "$URL") || die "HEAD request failed"
lm=$(printf '%s\n' "$hdr" | awk 'tolower($1)=="last-modified:"{sub(/^[^:]*: /,""); print; exit}' | tr -d '\r')
cl=$(printf '%s\n' "$hdr" | awk 'tolower($1)=="content-length:"{print $2; exit}' | tr -d '\r')
[ -n "$lm" ] && [ -n "$cl" ] || die "no last-modified/content-length in response headers"

sig="$lm|$cl"
prev=$(cat "$STAMP" 2>/dev/null || echo "none")

if [ "$sig" = "$prev" ] && [ "${FORCE:-0}" != "1" ]; then
  log "no new dump ($lm) -- nothing to do"
  record --status skipped --step check --dump-modified "$lm" --dump-bytes "$cl" \
    --message "no new dump upstream"
  exit 0
fi

log "new dump: $lm ($cl bytes); previous: $prev"
if [ "${DRY_RUN:-0}" = "1" ]; then
  log "(dry run, stopping before download)"
  record --status skipped --step dry-run --dump-modified "$lm" --dump-bytes "$cl" \
    --message "dry run: stopped before downloading"
  exit 0
fi

# --- 2. fetch + extract -----------------------------------------------------
# Download beside the real file and only move it into place once the size checks
# out, so an interrupted transfer cannot leave a truncated dump behind.
STEP=download
record --status running --step download --dump-modified "$lm" --dump-bytes "$cl"
log "downloading ..."
curl -L -A "$UA" -m 3600 --retry 3 --retry-delay 30 -o podcastindex_feeds.db.tgz.part "$URL" \
  || die "download failed"
got=$(stat -c '%s' podcastindex_feeds.db.tgz.part)
[ "$got" = "$cl" ] || die "size mismatch: got $got, expected $cl"
mv podcastindex_feeds.db.tgz.part podcastindex_feeds.db.tgz
log "downloaded $got bytes; extracting ..."
STEP=extract
tar -xzf podcastindex_feeds.db.tgz || die "extract failed"

# --- 3. build locally -------------------------------------------------------
STEP=build
record --status running --step build
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
STEP=load
turso_env || die "turso credentials unavailable"

# Read the outgoing count before dropping anything: it is the only moment it
# exists, and the difference between it and `rows` is the one number that says
# what a rebuild actually did.
before=$(echo "SELECT COUNT(*) FROM podcasts;" | "$TURSO" db shell p0dcasters 2>/dev/null | tr -dc '0-9')
record --status running --step load --prev-count "$before"

log "reloading Turso ..."
echo "DROP TABLE IF EXISTS podcasts_fts; DROP TABLE IF EXISTS podcasts;" \
  | "$TURSO" db shell p0dcasters >> "$LOG" 2>&1 || die "drop failed"
"$NODE" load_turso.mjs >> "$LOG" 2>&1 || die "load_turso.mjs failed (prod tables are dropped -- rerun with FORCE=1)"

remote=$(echo "SELECT COUNT(*) FROM podcasts;" | "$TURSO" db shell p0dcasters 2>/dev/null | tr -dc '0-9')
[ "$remote" = "$rows" ] || die "prod has $remote rows, expected $rows"

printf '%s' "$sig" > "$STAMP"
log "OK: $rows podcasts live (dump $lm)"
record --status ok --step load --count "$rows" --prev-count "$before" \
  --message "$rows podcasts live"
