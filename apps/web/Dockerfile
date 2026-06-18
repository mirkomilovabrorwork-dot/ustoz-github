FROM node:20-alpine AS base
RUN corepack enable

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /app

# Copy workspace config files needed for pnpm install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ ./patches/

# Copy all package.json files so pnpm can resolve workspaces
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/database/package.json ./packages/database/
COPY packages/env/package.json ./packages/env/
COPY packages/local-docker/package.json ./packages/local-docker/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
COPY packages/web-api-contract/package.json ./packages/web-api-contract/
COPY packages/web-api-contract-effect/package.json ./packages/web-api-contract-effect/
COPY packages/web-backend/package.json ./packages/web-backend/
COPY packages/web-domain/package.json ./packages/web-domain/

RUN pnpm install --frozen-lockfile

# Stage 2: Build the application
FROM base AS builder
WORKDIR /app

# Copy the entire node_modules tree (pnpm virtual store + workspace symlinks)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/env/node_modules ./packages/env/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/packages/utils/node_modules ./packages/utils/node_modules
COPY --from=deps /app/packages/web-api-contract/node_modules ./packages/web-api-contract/node_modules
COPY --from=deps /app/packages/web-api-contract-effect/node_modules ./packages/web-api-contract-effect/node_modules
COPY --from=deps /app/packages/web-backend/node_modules ./packages/web-backend/node_modules
COPY --from=deps /app/packages/web-domain/node_modules ./packages/web-domain/node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules

# Copy all source files
COPY . .

# NEXT_PUBLIC_DOCKER_BUILD enables standalone output mode in next.config.mjs
# Let the workflow plugin regenerate route handlers during build — the
# pre-compiled files in apps/web/app/.well-known/workflow/ are gitignored
# and won't be regenerated on a fresh clone otherwise.
ENV NEXT_PUBLIC_DOCKER_BUILD=true
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time public env vars (baked into Next.js client bundle)
ARG WEB_URL=https://web-production-e6fe4.up.railway.app
ARG NEXT_PUBLIC_WEB_URL=https://web-production-e6fe4.up.railway.app
ENV WEB_URL=$WEB_URL
ENV NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL

# Build upstream packages first (database, env, utils, web-backend, web-domain)
# Then build Next.js app using standard webpack (not turbopack) for lower memory usage
RUN pnpm --filter @cap/database build && \
    pnpm --filter @cap/env build && \
    pnpm --filter @cap/utils build && \
    pnpm --filter @cap/web-domain build && \
    pnpm --filter @cap/web-backend build && \
    pnpm --filter @cap/web build:next:docker

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Use the system ffmpeg installed below instead of the ffmpeg-static binary,
# which isn't bundled into the Next.js standalone output.
ENV FFMPEG_PATH=/usr/bin/ffmpeg

# ffmpeg is required by the transcription pipeline to extract audio from video.
RUN apk add --no-cache ffmpeg

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone build output (includes all required server-side files)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# Copy static assets (CSS, JS chunks, images)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# Copy public directory (favicons, robots.txt, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
# Copy database migrations for runtime migration support
COPY --from=builder --chown=nextjs:nodejs /app/packages/database/migrations ./apps/web/migrations

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
