FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json tsconfig*.json nest-cli.json ./
RUN npm install

COPY src/ ./src/
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8045
VOLUME ["/app/data"]

ENV ACCOUNTS_FILE=/app/data/accounts.json
ENV PORT=8045
ENV HOST=0.0.0.0

CMD ["node", "dist/main"]
