#!/bin/sh
# p0dcasters.com's own Redis on dev2, for the directory daemon's BullMQ queue
# (@profullstack/scraper-daemon). One Redis per site, as the fleet does:
# redis:8-alpine, loopback only, AOF on, noeviction (BullMQ requires it), its own
# volume. Idempotent: creates the container once, leaves a running one alone.
# The daemon unit sets REDIS_URL=redis://127.0.0.1:6394.
set -eu
NAME=p0dcasters-redis
PORT=6394
if docker inspect "$NAME" >/dev/null 2>&1; then
  [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = true ] || docker start "$NAME" >/dev/null
else
  docker run -d --name "$NAME" --restart unless-stopped \
    --memory 256m --memory-swap 256m \
    -p "127.0.0.1:${PORT}:6379" -v p0dcasters-redis:/data \
    redis:8-alpine redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy noeviction >/dev/null
fi
i=0
while [ $i -lt 20 ]; do
  [ "$(docker exec "$NAME" redis-cli ping 2>/dev/null)" = PONG ] && { echo "redis: $NAME on 127.0.0.1:$PORT"; exit 0; }
  i=$((i + 1)); sleep 1
done
echo "redis: $NAME did not answer" >&2
exit 1
