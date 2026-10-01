# syntax=docker/dockerfile:1
#
# p0dcasters.com, run on Bun.
#
# This file lives at .nixpacks/Dockerfile because that is the path dev2's compose
# stack builds (cli-tools dev2/dev2-site provision records it per site). It used to
# be nixpacks output (Node + pnpm); it is now a hand-written Bun image, so do not
# regenerate it with nixpacks.
#
# `next build` runs in the image. It used to run at container start (under Node
# too) because the prerendered pages read Postgres; a database refusal at that
# moment left the site down (503, 2026-10-01). Those routes now render per
# request with an in-process cache (src/lib/cached-db.ts), so the build needs no
# DATABASE_URL and a container start is just `next start`.
#
# Contract with /home/anthony/www/p0dcasters.com on dev2, unchanged: listens on
# 3000 inside the container, answers / for the deploy health check, reads its
# secrets from app.env at run time.

FROM oven/bun:1.4.0-slim AS base
WORKDIR /app
RUN chown bun:bun /app
USER bun

# Production dependencies only, for the runtime image.
FROM base AS prod-deps
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS build
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --chown=bun:bun . .
ENV NEXT_TELEMETRY_DISABLED=1
# `bun --bun next build`: Next builds on Bun. No database needed.
RUN bun run build

# Not standalone: /cli and the OG image read src/fonts and public/ through
# process.cwd(), so the tree ships with production node_modules and .next.
FROM base AS runtime
COPY --chown=bun:bun . .
COPY --from=prod-deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/.next ./.next
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
# 127.0.0.1, not localhost: localhost resolves ::1 first and Next binds IPv4 only.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/robots.txt').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
# Next's own entry under bun, as PID 1: no `bun run` wrapper and no node shim
# (node_modules/.bin/next has a node shebang, which oven/bun maps to bun).
CMD ["bun", "--bun", "node_modules/next/dist/bin/next", "start"]
