# syntax=docker/dockerfile:1

# One Obsidian Headless sync client per synced user (ADR 0075). Our own image, because it holds the
# user's Obsidian login; the pinned version is checked against Obsidian's docs when it is raised.
FROM node:24-slim

ARG OBSIDIAN_HEADLESS_VERSION=0.0.14

RUN npm install -g "obsidian-headless@${OBSIDIAN_HEADLESS_VERSION}" \
  && npm cache clean --force

# The CLI keeps its login and sync state in ~/.config/obsidian-headless (verified in cli.js of the
# pinned version: $XDG_CONFIG_HOME/obsidian-headless, else ~/.config/obsidian-headless). Compose
# mounts a volume there, so it is created here owned by the node user (UID 1000).
RUN mkdir -p /home/node/.config/obsidian-headless /vault /status \
  && chown -R node:node /home/node/.config /vault /status

COPY --chmod=755 sync.sh /usr/local/bin/sync.sh

ENV VAULT_PATH=/vault \
    STATUS_DIR=/status

USER node
ENTRYPOINT [ "/usr/local/bin/sync.sh" ]
