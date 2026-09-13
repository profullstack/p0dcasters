#!/bin/sh
# p0dcasters CLI installer.
#
#   curl -fsSL https://p0dcasters.com/install.sh | sh
#
# Installs a single Node script to ~/.local/bin/p0d. Nothing else is written,
# no package manager is invoked, and uninstalling is `p0d remove --yes` or rm
# on the one file. Override the destination with P0D_BIN=/somewhere/bin.
set -eu

SITE="${P0D_SITE:-https://p0dcasters.com}"
BIN="${P0D_BIN:-$HOME/.local/bin}"
SOURCE="$SITE/cli/p0d.mjs"

say() { printf '%s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

# The CLI uses top-level await and a global fetch, so an old node fails at
# parse time with a message that has nothing to do with the real problem.
command -v node >/dev/null 2>&1 || fail "node is required. Install Node 22 or newer, then run this again."
node -e 'process.exit(parseInt(process.versions.node, 10) >= 22 ? 0 : 1)' 2>/dev/null ||
  fail "Node 22 or newer is required (found $(node -v))."

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -qO- "$1"; }
else
  fail "curl or wget is required."
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT INT TERM

say "Downloading $SOURCE"
fetch "$SOURCE" > "$TMP" || fail "download failed."

# A proxy or captive portal answering 200 with an HTML page is the common
# failure, and installing that gives a broken command with a baffling error.
head -n 1 "$TMP" | grep -q '^#!' || fail "downloaded file is not the CLI (no shebang). Check $SOURCE."
[ -s "$TMP" ] || fail "downloaded file is empty."

mkdir -p "$BIN"
cp "$TMP" "$BIN/p0d"
chmod 755 "$BIN/p0d"
say "Installed $BIN/p0d"

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) say "Add $BIN to your PATH, e.g.  export PATH=\"$BIN:\$PATH\"" ;;
esac
say "Try:  p0d search bookbinding    p0d submit https://example.org"
