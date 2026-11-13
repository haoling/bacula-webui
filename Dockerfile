FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# ジョブ実行・有効化に使う bconsole。接続設定は BCONSOLE_CONFIG の指すファイルを Secret から渡す
RUN apt-get update && apt-get install -y --no-install-recommends bacula-console \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --omit=dev -w server
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/public server/public
WORKDIR /app/server
USER node
CMD ["node", "dist/index.js"]
