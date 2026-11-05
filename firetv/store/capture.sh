#!/bin/sh
# Store screenshots for the Amazon Appstore listing, 1920x1080.
#
# These must carry NO third-party cover art and NO real show names. Amazon
# rejected 1.0.0 on 2026-11-04 because the screenshots were live captures of
# /search: real artwork and real titles (Mighty Oaks Daily Devotional, The
# Harry Sisson Show) were in the listing, and we hold no licence to any of it.
#
# So the grid comes from /tv-preview, which renders the real card grid with
# invented shows and no image URLs — <Art> then draws its own letter tile for
# every square. The app is a WebView of exactly this site at exactly this size,
# so a headless capture is what the TV shows, without needing the Android SDK.
#
# Usage (defaults to production):
#   sh firetv/store/capture.sh [BASE_URL]
set -eu
BASE=${1:-https://p0dcasters.com}
OUT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/shots
mkdir -p "$OUT"

shot() { # shot <name> <path>
  docker run --rm --network host -v "$OUT:/out" -w /out \
    --entrypoint chromium-browser zenika/alpine-chrome:124 \
    --headless --no-sandbox --disable-gpu --hide-scrollbars \
    --window-size=1920,1080 --virtual-time-budget=12000 \
    --screenshot="/out/$1.png" "$BASE$2" >/dev/null 2>&1
  echo "$1.png  <-  $BASE$2"
}

shot 01-home /
shot 02-grid /tv-preview

echo
echo "Check both by eye before uploading: no cover art that is not ours, no real show titles."
ls -l "$OUT"/01-home.png "$OUT"/02-grid.png
