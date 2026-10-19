#!/bin/sh
# Bring the host-side directory daemon up to the commit deploy-app.sh just
# checked out (the deploy workflow runs this right after it). The web image
# installs its own dependencies; the daemon runs on the host, so this installs
# them here (node_modules is in .dockerignore, so the image never sees them),
# re-installs the unit file and restarts the service.
#
# A pipeline step in flight (a build or load holds ~/p0dcasters-data/.refresh.lock)
# is not interrupted: the restart is skipped and the daemon keeps its old code
# until the next deploy. The scripts it shells out to are read fresh every run.
set -eu
APP=$(cd "$(dirname "$0")/.." && pwd)
UNIT=p0dcasters-daemon.service
LOCK=/home/anthony/p0dcasters-data/.refresh.lock
export HOME=/home/anthony
export PATH=/home/anthony/.local/share/mise/shims:/home/anthony/.local/bin:/usr/local/bin:/usr/bin:/bin
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}

cd "$APP"
bun install --frozen-lockfile
install -D -m 644 deploy/$UNIT "$HOME/.config/systemd/user/$UNIT"
systemctl --user daemon-reload
systemctl --user enable "$UNIT" >/dev/null 2>&1 || true

if systemctl --user is-active --quiet "$UNIT" && ! flock -n "$LOCK" true; then
  echo "daemon: a refresh holds $LOCK -- not restarting mid-run"
else
  systemctl --user restart "$UNIT"
fi
sleep 5
systemctl --user is-active "$UNIT"
