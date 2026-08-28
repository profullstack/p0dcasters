#!/bin/sh
# Mail DNS for p0dcasters.com: Resend for sending, Forward Email for receiving.
#
#   PORKBUN_API_KEY=pk1_xxx PORKBUN_SECRET_API_KEY=sk1_xxx sh scripts/dns-mail-p0dcasters.sh
#
# Keys are read from the environment and never written anywhere. Add DRY_RUN=1
# to see the plan without touching DNS.
#
# The two halves do not overlap, which is the point of this split:
#   Resend sends from the "send" subdomain (its MX/SPF live on send.p0dcasters.com),
#   so the root MX stays free for Forward Email to receive on. Neither clobbers
#   the other, and the Railway ALIAS from dns-p0dcasters.sh is untouched.
#
# Re-running is safe: every record is matched on name+type+content first and
# skipped if it is already there.
set -eu

DOMAIN=p0dcasters.com
API=https://api.porkbun.com/api/json/v3

# Resend domain c3928c2f-54b8-4b6d-aa5c-6aa1a07599e4 (region us-east-1).
# Values come from `resend domains get <id>`; the DKIM value is a public key.
DKIM_NAME=resend._domainkey
DKIM_VALUE='p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgX2E74zXw78IAM+2QvwQyaGcxITRYs72qk6PH9iLESqznOHVZkqh8+aJ36T2YDwD/q6E6203KMYn7sZ+G+mXohasbYH0iojF+i6qrb2vRvWchklsrRNFnPh6eATip7qxLzyqmtJrrrvUcLZmO8y/4oxAQD3lc280u75j8QaEdBwIDAQAB'
SEND_MX=feedback-smtp.us-east-1.amazonses.com
SEND_SPF='v=spf1 include:amazonses.com ~all'

# Forward Email free tier is entirely DNS-driven: no account or API key needed.
# A bare "forward-email=<address>" is a catch-all for the whole domain.
FORWARD_TO=${FORWARD_TO:-anthony@profullstack.com}

: "${PORKBUN_API_KEY:?set PORKBUN_API_KEY}"
: "${PORKBUN_SECRET_API_KEY:?set PORKBUN_SECRET_API_KEY}"

auth() { printf '{"apikey":"%s","secretapikey":"%s"%s}' \
  "$PORKBUN_API_KEY" "$PORKBUN_SECRET_API_KEY" "${1:-}"; }

call() { curl -sS --max-time 30 -H 'Content-Type: application/json' -d "$2" "$API/$1"; }

# json_str <value> -- JSON-encode a shell string so quotes/backslashes survive.
json_str() { printf '%s' "$1" | jq -Rs .; }

echo "reading DNS for $DOMAIN ..."
records=$(call "dns/retrieve/$DOMAIN" "$(auth)")
[ "$(printf '%s' "$records" | jq -r '.status // "ERROR"')" = SUCCESS ] || {
  echo "could not read DNS:"; printf '%s\n' "$records" | jq -r '.message? // .'; exit 1; }

# Receiving is the destructive half: if the root already has MX records pointing
# somewhere other than Forward Email, mail is already flowing and we stop.
foreign_mx=$(printf '%s' "$records" | jq -r --arg d "$DOMAIN" \
  '[.records[] | select(.name==$d and .type=="MX" and (.content | test("forwardemail\\.net$") | not))] | length')
if [ "$foreign_mx" != "0" ]; then
  echo "REFUSING: $DOMAIN already has root MX records not pointing at Forward Email:"
  printf '%s' "$records" | jq -r --arg d "$DOMAIN" \
    '.records[] | select(.name==$d and .type=="MX") | "  MX \(.name) -> \(.content)"'
  echo "Mail is already being delivered somewhere. Repoint by hand, then re-run."
  exit 1
fi

created=0; skipped=0

# have <fqdn> <type> <content> -- is this exact record already present?
have() {
  printf '%s' "$records" | jq -e --arg n "$1" --arg t "$2" --arg c "$3" \
    'any(.records[]; .name==$n and .type==$t and .content==$c)' >/dev/null 2>&1
}

# ensure <label> <type> <content> [prio] -- create the record unless it exists.
# <label> is the subdomain, or "" for the root.
ensure() {
  label=$1; type=$2; content=$3; prio=${4:-}
  if [ -n "$label" ]; then fqdn="$label.$DOMAIN"; else fqdn="$DOMAIN"; fi

  if have "$fqdn" "$type" "$content"; then
    echo "  SKIP   $type $fqdn (already set)"
    skipped=$((skipped + 1))
    return 0
  fi

  echo "  CREATE $type $fqdn -> $content${prio:+ (prio $prio)}"
  [ "${DRY_RUN:-0}" = "1" ] && return 0

  body=",\"name\":$(json_str "$label"),\"type\":$(json_str "$type"),\"content\":$(json_str "$content"),\"ttl\":\"600\""
  [ -n "$prio" ] && body="$body,\"prio\":$(json_str "$prio")"

  out=$(call "dns/create/$DOMAIN" "$(auth "$body")")
  status=$(printf '%s' "$out" | jq -r '.status // "ERROR"')
  if [ "$status" != SUCCESS ]; then
    echo "    FAILED: $(printf '%s' "$out" | jq -r '.message // .')"
    return 1
  fi
  created=$((created + 1))
}

echo
echo "Resend (sending, on the send. subdomain):"
ensure "$DKIM_NAME" TXT "$DKIM_VALUE"
ensure send MX "$SEND_MX" 10
ensure send TXT "$SEND_SPF"

echo
echo "Forward Email (receiving, on the root):"
ensure "" MX mx1.forwardemail.net 10
ensure "" MX mx2.forwardemail.net 10
ensure "" TXT "forward-email=$FORWARD_TO"

echo
echo "DMARC (monitor only -- p=none reports without affecting delivery):"
ensure _dmarc TXT "v=DMARC1; p=none; rua=mailto:$FORWARD_TO"

echo
if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "(dry run, nothing changed)"
  exit 0
fi
echo "created $created record(s), skipped $skipped already present."
echo
echo "Then, to finish Resend verification:"
echo "  resend domains verify c3928c2f-54b8-4b6d-aa5c-6aa1a07599e4"
echo "  resend domains get    c3928c2f-54b8-4b6d-aa5c-6aa1a07599e4   # poll until \"verified\""
echo
echo "Check receiving with:"
echo "  dig +short MX $DOMAIN"
echo "  dig +short TXT $DOMAIN"
