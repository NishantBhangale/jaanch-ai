#####----Stage 1: Build the frontend----#####
FROM dhi.io/node:24-dev AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
#####----Stage 2: Serve the frontend----#####
FROM dhi.io/node:24
WORKDIR /app
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json vite.config.js ./
ENV NODE_ENV=production
USER node:node
EXPOSE 4173
ENTRYPOINT ["node", "--no-warnings"]
CMD ["./node_modules/vite/bin/vite.js", "preview", "--host", "0.0.0.0", "--port", "4173"]
