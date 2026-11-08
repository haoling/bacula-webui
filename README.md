# bacula-webui

Bacula 用の自分向け Web UI。TypeScript 一本 (Hono + React/Vite)。

- 認証: 前段の common-auth (forwardAuth) に任せる。アプリ自体にログインは無い。
- 設定: 環境変数のみ (`DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` `PORT`)。DB は読み取り専用ロールを使う。
- 開発: `npm install` → `npm run dev:server` / `npm run dev:web`
- Phase 1: ジョブ一覧とジョブログ閲覧。
