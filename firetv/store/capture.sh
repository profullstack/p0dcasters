#!/bin/sh
# Store screenshots for the Amazon Appstore listing, 1920x1080.
#
# These must carry NO third-party cover art and NO real show names. Amazon
# rejected 1.0.0 on 2026-11-04 because the screenshots were live captures of
# /search: real artwork and real titles (Mighty Oaks Daily Devotional, The
# Harry Sisson Show) were in the listing, and we hold no licence to any of it.
#
# Both shots therefore come from /tv-preview, which renders the real card grid
# with invented shows and no image URLs, so <Art> draws its own typographic
# tile for every square. The app is a WebView of this site at this size, so a
# headless capture is what the TV shows, without needing the Android SDK.
#
# Three things that are not obvious, each found the hard way:
#
#   * NOT the home page. Below its hero it shows the "deep catalogues" row,
#     which is real cover art - and two of those shows are the ones Amazon
#     named. /tv-preview?hero=1 gives the same hero with our own grid instead.
#   * NOT /search either, even with no query: it carries a sponsored ad and
#     names a real third-party domain in its help text.
#   * Point BASE at the app container, not at the public hostname. p0dcasters
#     answers a headless browser with its own x402 paywall ("You have used up
#     the free allowance") after 20 requests an hour, and you will screenshot
#     that instead. A browser user agent is still needed: the default
#     HeadlessChrome string is treated as a crawler.
#
# Usage:
#   sh firetv/store/capture.sh                      # the dev2 app container
#   sh firetv/store/capture.sh http://127.0.0.1:PORT
set -eu
BASE=${1:-http://127.0.0.1:3235}
OUT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/shots
UA="Mozilla/5.0 (X11; CrKey armv7l 1.5.16041) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
mkdir -p "$OUT"

shot() { # shot <name> <path>
  docker run --rm --memory 3g --shm-size 1g --network host \
    -v "$OUT:/out" -w /out --entrypoint chromium-browser \
    zenika/alpine-chrome:124 \
    --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --hide-scrollbars --window-size=1920,1080 --virtual-time-budget=15000 \
    --user-agent="$UA" --screenshot="/out/$1.png" "$BASE$2"
  echo "$1.png  <-  $BASE$2"
}

shot 01-hero "/tv-preview?hero=1"
shot 02-grid /tv-preview

echo
echo "Look at both before uploading: no cover art that is not ours, no real show titles."
ls -l "$OUT"
