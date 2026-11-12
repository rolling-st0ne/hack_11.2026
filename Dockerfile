FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Only application code and synthetic seed data enter the image.
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node client ./client
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node data/filesystem ./data/filesystem
COPY --chown=node:node licenses ./licenses
COPY --chown=node:node THIRD-PARTY-NOTICES.md ./
RUN mkdir -p /app/.data /metabase-source \
    && chown node:node /app/.data /metabase-source

USER node
EXPOSE 3000
CMD ["node", "scripts/container-start.mjs"]
