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
# rather than the resolved binaries because they survive a runtime upgrade.
#
# Every run also records itself into the `refresh_runs` table, which is what
# /crawlstats shows. That includes the runs that do nothing: four "skipped" rows
# a day are the only evidence from production that this cron entry still exists,
# and their absence is precisely the silent failure the page exists to catch.
# Recording is best effort -- a lost status line never fails a rebuild, but it
# is written to the log, because a run the page cannot see is half a stall.
#
# How it recovers on its own:
#
#   * One run at a time. A lock file is held for the whole run, so a slow
#     download never overlaps the next tick and the watchdog can kick a run
#     without doubling up.
#   * Nothing here talks to the Turso CLI. Its browser login expires after a
#     week and it then answers "You are not logged in" on stdout with exit 0,
#     which stalled the pipeline for nine days in September 2026 with every
#     command reporting success. Credentials are a database token that does
#     not expire, taken from the first source the database accepts: the cached
#     token file, then the p0dcasters--prod vault, then the CLI if it happens
#     to be logged in. A rejected token is thrown away and the chain re-walked.
#   * Prod is never left empty. load_turso.mjs stages the new rows beside the
#     live table and swaps them in one transaction, so a failure anywhere
#     leaves the previous directory serving. The dump stamp is only advanced
#     on success, so the next tick simply tries again -- and it skips the 1.8 GB
#     download when the dump it already has on disk is the one upstream is
#     still serving.
#   * A run that dies without reporting (timeout, reboot, kill) is closed out
#     as failed by the next run's first status write, so /crawlstats never
#     shows a phantom "running" for days.
set -eu

DATA=/home/anthony/p0dcasters-data
# The checkout this script lives in, so the loader and recorder beside it are
# the ones at the same commit. Cron runs the copy in ~/p0dcasters.
SCRIPTS=$(cd "$(dirname "$0")" && pwd)
STAMP=$DATA/.last-dump-stamp
DLSTAMP=$DATA/.dump-extracted-stamp
LOG=$DATA/refresh.log
LOCK=$DATA/.refresh.lock
TOKENF=$DATA/.turso-token
URLF=$DATA/.turso-url
URL=https://public.podcastindex.org/podcastindex_feeds.db.tgz
UA='p0dcasters/1.0 (+https://p0dcasters.com)'

NODE=/home/anthony/.local/share/mise/shims/node
PY=/home/anthony/.local/share/mise/shims/python3
TURSO=/home/anthony/.turso/turso
LOGICSRC=/home/anthony/.local/bin/logicsrc
export HOME=/home/anthony
export PATH=/home/anthony/.local/share/mise/shims:/home/anthony/.local/bin:/usr/local/bin:/usr/bin:/bin

# The database this feeds. A fixed hostname rather than a CLI lookup; the vault
# copy overrides it if the two ever disagree.
DEFAULT_DB_URL=libsql://p0dcasters-profullstack.aws-us-west-2.turso.io

# A build that yields fewer than this many rows is treated as broken, and prod is
# left alone. The directory has sat around 21.6k; a sudden collapse means the dump
# or a script changed shape, not that podcasting ended.
MIN_ROWS=${MIN_ROWS:-10000}
# Ceiling on the Turso load, in seconds. A normal load takes about two minutes.
LOAD_TIMEOUT=${LOAD_TIMEOUT:-1800}

# This run's identity and its own slice of the log. The shared refresh.log is
# append-only across every run ever; RUNLOG holds just this one, so the page can
# show a run's log beside that run.
RUN_KEY=$(date -u '+%Y%m%dT%H%M%SZ')-$$
STARTED=$(date -u '+%s')
RUNLOG=$(mktemp "${TMPDIR:-/tmp}/p0d-refresh.XXXXXX")
STEP=check
FINISHED=0
CRED_SOURCE=none

log() {
  line="$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
  echo "$line" >> "$LOG"
  echo "$line" >> "$RUNLOG"
}

# --- credentials --------------------------------------------------------------
# probe: does the database accept what is in the environment right now?
probe() {
  "$NODE" "$SCRIPTS/turso_sql.mjs" "SELECT 1" >/dev/null 2>&1
}

# use_creds URL TOKEN SOURCE: export the pair if the database accepts it, and
# cache it for the next run unless it came from the cache already.
use_creds() {
  [ -n "$1" ] && [ -n "$2" ] || return 1
  TURSO_DATABASE_URL=$1
  TURSO_AUTH_TOKEN=$2
  export TURSO_DATABASE_URL TURSO_AUTH_TOKEN
  if ! probe; then
    unset TURSO_DATABASE_URL TURSO_AUTH_TOKEN
    return 1
  fi
  if [ "$3" != cache ]; then
    (umask 077; printf '%s' "$2" > "$TOKENF"; printf '%s' "$1" > "$URLF")
    log "turso credential refreshed from $3"
  fi
  CRED_SOURCE=$3
  return 0
}

turso_env() {
  if [ -n "${TURSO_DATABASE_URL:-}" ] && [ -n "${TURSO_AUTH_TOKEN:-}" ]; then return 0; fi
  url=$(cat "$URLF" 2>/dev/null || echo "$DEFAULT_DB_URL")

  # 1. The cached token. Database tokens are minted without an expiry, so this
  #    is the normal path for months at a time.
  use_creds "$url" "$(cat "$TOKENF" 2>/dev/null || true)" cache && return 0

  # 2. The vault. The site's own URL and token, the same pair Railway runs on.
  vf=$(mktemp "${TMPDIR:-/tmp}/p0d-vault.XXXXXX")
  if "$LOGICSRC" teams pull profullstack p0dcasters prod --env "$vf" >/dev/null 2>&1; then
    vurl=$(sed -n 's/^TURSO_DATABASE_URL=//p' "$vf" | tr -d "\"' \r")
    vtok=$(sed -n 's/^TURSO_AUTH_TOKEN=//p' "$vf" | tr -d "\"' \r")
    rm -f "$vf"
    use_creds "${vurl:-$url}" "$vtok" vault && return 0
  fi
  rm -f "$vf"

  # 3. The CLI, only while its login is alive. It exits 0 either way, so the
  #    output is what has to be read.
  if "$TURSO" auth whoami 2>/dev/null | grep -qv 'not logged in'; then
    ctok=$("$TURSO" db tokens create p0dcasters 2>/dev/null | tail -1 || true)
    use_creds "$url" "$ctok" cli && return 0
  fi

  log "no working Turso credential: cache, vault and CLI all failed"
  return 1
}

# Write this run's state to `refresh_runs`. Never fails the caller and never
# calls die() -- it is reached *from* die(), and a loop there would turn a
# reportable failure into a hang.
record() {
  set +e
  if turso_env; then
    "$NODE" "$SCRIPTS/record_run.mjs" \
      --key "$RUN_KEY" --started "$STARTED" --log "$RUNLOG" "$@" >/dev/null 2>&1
    rc=$?
    if [ $rc -eq 3 ]; then
      # Exit 3 is "the write was rejected"; a revoked cached token is the
      # likeliest cause, so throw it away and walk the sources again.
      rm -f "$TOKENF"
      unset TURSO_DATABASE_URL TURSO_AUTH_TOKEN
      if turso_env; then
        "$NODE" "$SCRIPTS/record_run.mjs" \
          --key "$RUN_KEY" --started "$STARTED" --log "$RUNLOG" "$@" >/dev/null 2>&1
        rc=$?
      fi
    fi
    [ $rc -eq 0 ] || log "record: could not write run status (exit $rc) -- /crawlstats will not see this run"
  else
    log "record: skipped, no credential -- /crawlstats will not see this run"
  fi
  set -e
  return 0
}

die() {
  log "FAILED: $*"
  FINISHED=1
  record --status failed --step "$STEP" --message "$*"
  exit 1
}

# Anything that ends the run without passing through die() or the success
# path -- a signal, an unhandled error under set -e -- is still reported, so
# the page shows a failed run instead of a run stuck at "running".
on_exit() {
  rc=$?
  if [ "$FINISHED" != 1 ]; then
    log "ABORTED at step $STEP (exit $rc) -- next scheduled run retries"
    record --status failed --step "$STEP" --message "aborted at $STEP (exit $rc); next scheduled run retries"
  fi
  rm -f "$RUNLOG"
}
trap on_exit EXIT
trap 'exit 143' TERM INT HUP

cd "$DATA" || die "no $DATA"

# --- 0. one run at a time -------------------------------------------------------
exec 9>"$LOCK"
if ! flock -n 9; then
  FINISHED=1
  log "another refresh holds $LOCK -- leaving it alone"
  exit 0
fi

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
  FINISHED=1
  record --status skipped --step check --dump-modified "$lm" --dump-bytes "$cl" \
    --message "no new dump upstream"
  exit 0
fi

log "new dump: $lm ($cl bytes); previous: $prev"
if [ "${DRY_RUN:-0}" = "1" ]; then
  log "(dry run, stopping before download)"
  FINISHED=1
  record --status skipped --step dry-run --dump-modified "$lm" --dump-bytes "$cl" \
    --message "dry run: stopped before downloading"
  exit 0
fi

# --- 2. fetch + extract -----------------------------------------------------
# Download beside the real file and only move it into place once the size checks
# out, so an interrupted transfer cannot leave a truncated dump behind. When the
# previous attempt got this far and then failed later on, the dump on disk is
# already the one upstream is serving: go straight to the build.
STEP=download
if [ "$(cat "$DLSTAMP" 2>/dev/null || true)" = "$sig" ] && [ -s podcastindex_feeds.db ]; then
  log "dump $lm is already downloaded and extracted -- resuming from build"
else
  record --status running --step download --dump-modified "$lm" --dump-bytes "$cl"
  log "downloading ..."
  curl -sS -L -A "$UA" -m 3600 --retry 3 --retry-delay 30 -o podcastindex_feeds.db.tgz.part "$URL" \
    || die "download failed"
  got=$(stat -c '%s' podcastindex_feeds.db.tgz.part)
  [ "$got" = "$cl" ] || die "size mismatch: got $got, expected $cl"
  mv podcastindex_feeds.db.tgz.part podcastindex_feeds.db.tgz
  log "downloaded $got bytes; extracting ..."
  STEP=extract
  tar -xzf podcastindex_feeds.db.tgz || die "extract failed"
  printf '%s' "$sig" > "$DLSTAMP"
fi

# --- 3. build locally -------------------------------------------------------
# The scripts run from the repo checkout, not from copies in the data dir: a
# fix merged to master has to be the code that actually builds the directory.
STEP=build
record --status running --step build --dump-modified "$lm" --dump-bytes "$cl"
log "building live subset ..."
"$PY" "$SCRIPTS/build_live.py" >> "$LOG" 2>&1 || die "build_live.py failed"
log "building indie cut ..."
"$PY" "$SCRIPTS/export_indie.py" >> "$LOG" 2>&1 || die "export_indie.py failed"

rows=$("$PY" -c "import sqlite3;print(sqlite3.connect('$DATA/p0dcasters.db').execute('SELECT COUNT(*) FROM podcasts').fetchone()[0])") \
  || die "could not count rows in the new build"
log "built $rows podcasts"
[ "$rows" -ge "$MIN_ROWS" ] || die "only $rows rows (< $MIN_ROWS) -- refusing to touch prod"

# --- 4. load into Turso -----------------------------------------------------
# Only past this point does prod change, and even then only in the final swap
# transaction inside load_turso.mjs. Everything before it is staged beside the
# live table.
STEP=load
turso_env || die "no working Turso credential (cache, vault, CLI) -- prod untouched"

# The outgoing count, so the run can say what the rebuild actually did.
before=$("$NODE" "$SCRIPTS/turso_sql.mjs" "SELECT COUNT(*) FROM podcasts" 2>/dev/null || true)
record --status running --step load --prev-count "$before"

log "loading into Turso (credential: $CRED_SOURCE; staged, then swapped in one transaction) ..."
timeout -k 30 "$LOAD_TIMEOUT" "$NODE" "$SCRIPTS/load_turso.mjs" >> "$LOG" 2>&1 \
  || die "load_turso.mjs failed -- the previous directory keeps serving unless the log says 'swapped in'; next scheduled run retries"

remote=$("$NODE" "$SCRIPTS/turso_sql.mjs" "SELECT COUNT(*) FROM podcasts" 2>/dev/null || true)
[ "$remote" = "$rows" ] || die "prod has ${remote:-?} rows, expected $rows"

printf '%s' "$sig" > "$STAMP"
log "OK: $rows podcasts live (dump $lm)"
FINISHED=1
record --status ok --step load --count "$rows" --prev-count "$before" \
  --message "$rows podcasts live"
