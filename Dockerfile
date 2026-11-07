# syntax=docker/dockerfile:1

FROM node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/tsconfig.json apps/server/tsconfig.build.json apps/server/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.build.json packages/shared/
COPY apps/web/package.json apps/web/tsconfig.json apps/web/tsconfig.app.json apps/web/tsconfig.browser.json apps/web/tsconfig.node.json apps/web/vite.config.ts apps/web/index.html apps/web/
RUN pnpm install --frozen-lockfile

COPY apps/server/src apps/server/src
COPY packages/shared/src packages/shared/src
COPY apps/web/public apps/web/public
COPY apps/web/src apps/web/src
RUN pnpm --filter @atlas/shared --filter @atlas/server build \
  && pnpm --filter @atlas/web build \
  && pnpm --filter @atlas/server deploy --legacy --prod /deploy


# Gemini reads YouTube links itself (ADR 0081), so the image holds only the app
FROM node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9

ENV NODE_ENV=production \
    PORT=3100 \
    DATA_DIR=/data \
    WEB_DIR=/app/web

RUN mkdir -p /data && chown node:node /data

WORKDIR /app
COPY --from=build --chown=node:node /deploy ./
COPY --from=build --chown=node:node /repo/apps/web/dist ./web

USER node
EXPOSE 3100

CMD [ "node", "dist/src/server.js" ]
