#!/bin/sh
# Second line of defence for the directory refresh.
#
# Reads /api/crawlstats, the same JSON the /crawlstats page is drawn from, so
# it judges the pipeline exactly the way a visitor would: by what production
# has recorded, not by what this box believes it did. When the page would say
# anything but "healthy", it kicks refresh-if-new-dump.sh once -- that script
# holds its own lock, retries whatever failed last time, and re-walks its
# credential sources -- then reads the API again. If the page is still not
# healthy, it emails once every ALERT_EVERY seconds until it is.
#
# Runs from cron hourly, offset from the six-hourly refresh:
#   30 * * * * /bin/sh /home/anthony/p0dcasters/scripts/crawlstats-watchdog.sh
#
# The Resend key is the site's own, from the p0dcasters--prod vault, cached
# beside the database URL. ALERT_TO overrides the recipient.
set -u

DATA=/home/anthony/p0dcasters-data
SCRIPTS=$(cd "$(dirname "$0")" && pwd)
LOG=$DATA/watchdog.log
ALERTED=$DATA/.watchdog-alerted
KEYF=$DATA/.resend-key
# API is overridable so the alert path can be exercised against a dead address.
API=${API:-https://p0dcasters.com/api/crawlstats}
ALERT_TO=${ALERT_TO:-anthony@profullstack.com}
ALERT_EVERY=${ALERT_EVERY:-43200}

PY=/home/anthony/.local/share/mise/shims/python3
LOGICSRC=/home/anthony/.local/bin/logicsrc
export HOME=/home/anthony
export PATH=/home/anthony/.local/share/mise/shims:/home/anthony/.local/bin:/usr/local/bin:/usr/bin:/bin

log() { echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*" >> "$LOG"; }

# Prints: STATE IDLE_HOURS LAST_STATUS LAST_CHECK_AT
state() {
  curl -sS -m 30 "$API" 2>/dev/null | "$PY" -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("unreachable 0 - -"); sys.exit()
h = d.get("health") or {}
p = d.get("pipeline") or {}
print(h.get("state") or "unknown", round(h.get("idleHours") or 0, 1),
      p.get("lastCheckStatus") or "-", p.get("lastCheckAt") or "-")
'
}

set -- $(state)
s=${1:-unreachable}; idle=${2:-0}; last=${3:--}; at=${4:--}
if [ "$s" = healthy ]; then
  rm -f "$ALERTED"
  exit 0
fi
log "api says $s (idle ${idle}h, last check $last at $at)"

# --- recover ------------------------------------------------------------------
log "kicking refresh-if-new-dump.sh"
timeout -k 60 3h /bin/sh "$SCRIPTS/refresh-if-new-dump.sh" >/dev/null 2>&1
log "refresh exited $?"
set -- $(state)
s2=${1:-unreachable}
log "api now says $s2"
if [ "$s2" = healthy ]; then
  rm -f "$ALERTED"
  exit 0
fi

# --- alert, rate limited --------------------------------------------------------
now=$(date -u '+%s')
prev=$(cat "$ALERTED" 2>/dev/null || echo 0)
[ $((now - prev)) -ge "$ALERT_EVERY" ] || exit 0

key=$(cat "$KEYF" 2>/dev/null || true)
if [ -z "$key" ]; then
  vf=$(mktemp "${TMPDIR:-/tmp}/p0d-vault.XXXXXX")
  if "$LOGICSRC" teams pull profullstack p0dcasters prod --env "$vf" >/dev/null 2>&1; then
    key=$(sed -n 's/^RESEND_API_KEY=//p' "$vf" | tr -d "\"' \r")
  fi
  rm -f "$vf"
  [ -n "$key" ] && (umask 077; printf '%s' "$key" > "$KEYF")
fi
if [ -z "$key" ]; then
  log "no Resend key (cache or vault) -- cannot email"
  exit 1
fi

payload=$(mktemp "${TMPDIR:-/tmp}/p0d-alert.XXXXXX")
"$PY" - "$s2" "$idle" "$last" "$at" "$ALERT_TO" "$DATA/refresh.log" > "$payload" <<'EOF'
import json, sys
state, idle, last, at, to, logf = sys.argv[1:7]
try:
    tail = "".join(open(logf, encoding="utf-8", errors="replace").readlines()[-30:])
except Exception as e:
    tail = f"(could not read {logf}: {e})"
text = (
    f"p0dcasters.com/crawlstats reports {state}.\n\n"
    f"Last recorded check: {last} at {at} ({idle}h ago).\n"
    "The watchdog already re-ran scripts/refresh-if-new-dump.sh once and the API "
    "still does not say healthy, so this needs a person.\n\n"
    "Tail of ~/p0dcasters-data/refresh.log:\n\n" + tail
)
print(json.dumps({
    "from": "p0dcasters <noreply@p0dcasters.com>",
    "to": [to],
    "subject": f"[p0dcasters] directory refresh is {state}",
    "text": text,
}))
EOF
resp=$(curl -sS -m 30 -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $key" -H 'Content-Type: application/json' -d @"$payload")
rm -f "$payload"
case "$resp" in
  *'"id"'*) printf '%s' "$now" > "$ALERTED"; log "alert emailed to $ALERT_TO" ;;
  *) log "alert email failed: $resp" ;;
esac
