FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json tsconfig*.json nest-cli.json ./
RUN npm install

COPY src/ ./src/
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 8045
VOLUME ["/app/data"]

ENV ACCOUNTS_FILE=/app/data/accounts.json
ENV SQLITE_DB_PATH=/app/data/antigravity.sqlite
ENV PORT=8045
ENV HOST=0.0.0.0

CMD ["node", "dist/main"]
