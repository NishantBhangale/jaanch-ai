#######--stage 1: install production dependencies--########
FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
########--stage 2: runtime image (with Chromium for Health Reports)--########
FROM node:24-slim
WORKDIR /app

# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-core tini \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    CHROME_NO_SANDBOX=true

COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
COPY package*.json ./
COPY scripts ./scripts

RUN mkdir -p data/screenshots && chown -R node:node /app
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Tini manages Chromium and its child processes,
# handles signals, and prevents zombie processes.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]