# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG NODE_MIN_VERSION=22.23.4
RUN node -e "const c=process.versions.node.split('.').map(Number),m=process.argv[1].split('.').map(Number);for(let i=0;i<3;i++){if(c[i]>m[i])process.exit(0);if(c[i]<m[i]){console.error('Node '+process.versions.node+' < '+process.argv[1]);process.exit(1)}}" "$NODE_MIN_VERSION"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

FROM base AS deps
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build HUSKY=0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY prisma.config.ts .env.schema ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Le prérendu lit la base : l'URL arrive par secret de build, jamais dans une couche.
FROM base AS builder
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ARG NEXT_PUBLIC_CLOUDINARY_API_KEY
ARG NEXT_PUBLIC_WAVE_MERCHANT_ID
ARG NEXT_DEPLOYMENT_ID
ENV BUILD_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1 TZ=UTC \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME \
    NEXT_PUBLIC_CLOUDINARY_API_KEY=$NEXT_PUBLIC_CLOUDINARY_API_KEY \
    NEXT_PUBLIC_WAVE_MERCHANT_ID=$NEXT_PUBLIC_WAVE_MERCHANT_ID \
    NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/generated ./generated
COPY --from=deps /app/env.d.ts ./env.d.ts
COPY . .
RUN --mount=type=secret,id=db_url \
    set -a && . ./deploy/build.env && set +a \
    && export DATABASE_URL="$(cat /run/secrets/db_url)" \
    && pnpm build \
    && node deploy/redact-build-url.mjs
RUN node -p "require('varlock/package.json').version" > /varlock.version

FROM deps AS tools
ENV TZ=UTC
COPY . .
RUN touch .env
CMD ["pnpm", "--version"]

FROM base AS runner
COPY --from=builder /varlock.version /tmp/varlock.version
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g "varlock@$(cat /tmp/varlock.version)" \
 && npm cache clean --force && rm /tmp/varlock.version
ENV NODE_ENV=production TZ=UTC PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/.env.schema ./.env.schema
COPY --chown=node:node deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1
ENTRYPOINT ["tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
