# syntax=docker/dockerfile:1

FROM node:24-slim AS build

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


FROM node:24-slim

ARG TARGETARCH

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN case "${TARGETARCH}" in \
    amd64) asset=yt-dlp_linux ;; \
    arm64) asset=yt-dlp_linux_aarch64 ;; \
    *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac \
  && curl -fsSL -o /usr/local/bin/yt-dlp \
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}" \
  && chown node:node /usr/local/bin/yt-dlp \
  && chmod 755 /usr/local/bin/yt-dlp \
  && chown node:node /usr/local/bin \
  && apt-get purge -y curl && apt-get autoremove -y

RUN echo "--js-runtimes node" > /etc/yt-dlp.conf

ENV NODE_ENV=production \
    PORT=3100 \
    WORK_DIR=/tmp/mnemosyne \
    DATA_DIR=/data \
    VAULT_PATH=/vault \
    WEB_DIR=/app/web

RUN mkdir -p /data && chown node:node /data

WORKDIR /app
COPY --from=build --chown=node:node /deploy ./
COPY --from=build --chown=node:node /repo/apps/web/dist ./web
COPY --chown=node:node ops/docker-entrypoint.sh ./ops/docker-entrypoint.sh

USER node
EXPOSE 3100

ENTRYPOINT [ "./ops/docker-entrypoint.sh" ]
CMD [ "node", "dist/src/server.js" ]
