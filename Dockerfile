# Stage 1: Build Frontend Web UI
FROM node:22-slim AS web-builder
WORKDIR /app/web

COPY web/package*.json ./
RUN npm install

COPY web/ ./
RUN npm run build

# Stage 2: Build Backend NestJS
FROM node:22-slim AS backend-builder
WORKDIR /app

COPY package*.json tsconfig*.json nest-cli.json ./
RUN npm install

COPY src/ ./src/
RUN npm run build
RUN npm prune --omit=dev

# Stage 3: Production Runner
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/dist ./dist
COPY --from=web-builder /app/web/dist ./web/dist

EXPOSE 8045
VOLUME ["/app/data"]

ENV ACCOUNTS_FILE=/app/data/accounts.json
ENV SQLITE_DB_PATH=/app/data/antigravity.sqlite
ENV PORT=8045
# Inside a container 0.0.0.0 is required for -p port mapping to reach the process.
# It therefore overrides the loopback-in-Open-Mode default, so the safety boundary
# moves to the host: publish with -p 127.0.0.1:8045:8045 until an API key is set.
ENV HOST=0.0.0.0

CMD ["node", "dist/main"]
