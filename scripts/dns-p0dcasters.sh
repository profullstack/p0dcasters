#!/bin/sh
# Point p0dcasters.com at the Railway service.
#
#   PORKBUN_API_KEY=pk1_xxx PORKBUN_SECRET_API_KEY=sk1_xxx sh scripts/dns-p0dcasters.sh
#
# Keys are read from the environment and never written anywhere. Add DRY_RUN=1
# to see the plan without touching DNS.
#
# The domain currently has NO A/ALIAS record at all, so this only creates
# records; it never replaces a live target. Railway needs two:
#   ALIAS @               -> 5wkstbzs.up.railway.app   (root; Porkbun ALIAS, not CNAME)
#   TXT   _railway-verify -> railway-verify=<token>    (ownership / certificate)
set -eu

DOMAIN=p0dcasters.com
TARGET=5wkstbzs.up.railway.app
VERIFY=railway-verify=df9a0e3d322e2df2a13cd44416de6d1b7761e00e04a635ccac2bb2eb9d5ff50a
API=https://api.porkbun.com/api/json/v3

: "${PORKBUN_API_KEY:?set PORKBUN_API_KEY}"
: "${PORKBUN_SECRET_API_KEY:?set PORKBUN_SECRET_API_KEY}"

auth() { printf '{"apikey":"%s","secretapikey":"%s"%s}' \
  "$PORKBUN_API_KEY" "$PORKBUN_SECRET_API_KEY" "${1:-}"; }

call() { curl -sS --max-time 30 -H 'Content-Type: application/json' -d "$2" "$API/$1"; }

echo "reading DNS for $DOMAIN ..."
records=$(call "dns/retrieve/$DOMAIN" "$(auth)")
[ "$(printf '%s' "$records" | jq -r '.status // "ERROR"')" = SUCCESS ] || {
  echo "could not read DNS:"; printf '%s\n' "$records" | jq -r '.message? // .'; exit 1; }

existing_root=$(printf '%s' "$records" | jq -r --arg d "$DOMAIN" \
  '[.records[] | select(.name==$d and (.type=="A" or .type=="ALIAS" or .type=="CNAME"))] | length')
if [ "$existing_root" != "0" ]; then
  echo "REFUSING: $DOMAIN already has a root A/ALIAS/CNAME record:"
  printf '%s' "$records" | jq -r --arg d "$DOMAIN" \
    '.records[] | select(.name==$d and (.type=="A" or .type=="ALIAS" or .type=="CNAME")) | "  \(.type) \(.name) -> \(.content)"'
  echo "Remove or repoint it by hand, then re-run."
  exit 1
fi

echo "plan:"
echo "  CREATE ALIAS $DOMAIN -> $TARGET"
echo "  CREATE TXT   _railway-verify.$DOMAIN -> $VERIFY"

if [ "${DRY_RUN:-0}" = "1" ]; then echo "(dry run, nothing changed)"; exit 0; fi

echo "creating ALIAS ..."
out=$(call "dns/create/$DOMAIN" \
  "$(auth ",\"name\":\"\",\"type\":\"ALIAS\",\"content\":\"$TARGET\",\"ttl\":\"600\"")")
printf '%s\n' "$out" | jq -r '"  " + (.status // "ERROR") + " " + (.message // "")'

echo "creating verification TXT ..."
out=$(call "dns/create/$DOMAIN" \
  "$(auth ",\"name\":\"_railway-verify\",\"type\":\"TXT\",\"content\":\"$VERIFY\",\"ttl\":\"600\"")")
printf '%s\n' "$out" | jq -r '"  " + (.status // "ERROR") + " " + (.message // "")'

echo
echo "done. Verify with:"
echo "  dig +short $DOMAIN"
echo "  railway domain status 1c615890-26c7-4319-b999-fa85261e81c8"
