# syntax=docker/dockerfile:1
#
# p0dcasters.com, run on Bun.
#
# This file lives at .nixpacks/Dockerfile because that is the path dev2's compose
# stack builds (cli-tools dev2/dev2-site provision records it per site). It used to
# be nixpacks output (Node + pnpm); it is now a hand-written Bun image, so do not
# regenerate it with nixpacks.
#
# `next build` runs at CONTAINER START, not image build, exactly as before: the
# prerendered pages read the directory from Postgres, and DATABASE_URL lives only
# in app.env on dev2 (cli-tools sites.d/p0dcasters.com.json says the same).
#
# Contract with /home/anthony/www/p0dcasters.com on dev2, unchanged: listens on
# 3000 inside the container, answers / for the deploy health check, reads its
# secrets from app.env at run time.

FROM oven/bun:1.4.0-slim
WORKDIR /app
# The build at start writes .next/, so the non-root user owns /app. Installing and
# copying as that user (rather than a `chown -R` afterwards) keeps node_modules in
# one layer instead of two.
RUN chown bun:bun /app
USER bun
# Install before NODE_ENV=production: bun skips devDependencies under it, and the
# build needs typescript and the @types packages.
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --chown=bun:bun . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
# The build runs first, so give it time before health counts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
# `bun --bun next build` then `bun --bun next start`: Next builds and serves on Bun.
CMD ["sh", "-c", "bun run build && exec bun run start"]
