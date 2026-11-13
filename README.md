# bacula-webui

Bacula を管理するための、自分用 Web UI。TypeScript 一本（Hono + React/Vite）で、1 つのコンテナとして Kubernetes に載せる。

## できること / 予定

| Phase | 内容 | 状態 |
|---|---|---|
| 1 | ジョブ一覧、ジョブログ閲覧 | 実装済み |
| 2 | ジョブ実行、進捗バー、スケジュールの表示と有効/無効化 | 予定 |
| 3 | バックアップ済みファイルのツリー表示（最新版優先、バージョン履歴） | 予定 |
| 4 | Volume 使用状況の横帯表示 | 実装済み (`/api/volumes`、Volume タブ) |
| 5 | テープライブラリの有効/無効化 | 予定 |

## 構成

```
server/   Hono (Node.js) の API。カタログ DB の読み取りと、bconsole の呼び出し
web/      React + Vite の SPA。ビルド成果物は server/public に出力され、server が配信する
Dockerfile 1 イメージ (server + ビルド済み web)
```

- Bacula との通信
  - 閲覧系（ジョブ、ファイル、Volume）: カタログ DB（PostgreSQL）を **読み取り専用ロール** で直接 SQL。
  - 操作系（ジョブ実行、スケジュール、ストレージ有効化）: bconsole をコマンド実行（Phase 2 以降）。
  - 進捗: `status director` 等を定期取得して SSE で配信（Phase 2）。
- 認証: アプリ自体にログインは無い。前段の common-auth（forwardAuth）に任せるため、アプリへの経路は必ず common-auth 経由にすること。

## Volume 帯の計算

- File ボリューム: `JobMedia` の `StartFile/StartBlock` は `(file << 32) | block` のバイト位置なので、区間は正確。
- テープ: 位置が物理バイトではないため、ジョブのバイト数を「その Volume の JobMedia 行数 / 全 Volume の行数」で按分し、`VolBytes` に合わせて補正した **推定**（画面では斜線）。容量は `MaxVolBytes`、0 のときは Media Type の公称値。
- 空き = 容量 − カタログに残っているジョブの区間（Purge 済みの領域も空きになる）。
- コピー状況: Copy ジョブで作られたジョブは `PriorJobId` に原本を持つ。これを使い、帯の各区間（ジョブ）に「コピー済み / 未コピー / コピー（原本 Job N）」を付ける。Volume 内の原本ジョブがすべてコピー済みなら「全ジョブコピー済み → 削除可」、一部だけなら「一部のみコピー済み」のバッジを出す。

## 設定（環境変数）

実値はこのリポジトリに置かない。デプロイ側（Secret）から渡す。

| 変数 | 内容 |
|---|---|
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | カタログ DB（読み取り専用ロール）。`DB_PORT` の既定は 5432、`DB_NAME` の既定は `bacula` |
| `PORT` | 待ち受けポート（既定 8080） |

## 開発

```sh
npm install
npm run dev:server   # http://localhost:8080 (API)
npm run dev:web      # Vite 開発サーバー。/api は :8080 に転送
npm run typecheck
npm run build
```

## デプロイ

`main` への push で GitHub Actions が `ghcr.io/<owner>/bacula-webui` をビルドして push する。Kubernetes のマニフェストは別リポジトリ（`fei-yen-kubernetes`）で管理し、イメージのタグだけをそちらで更新する。

## 注意

- カタログ DB は **SQL_ASCII** のため、ファイル名やログの文字列は生のバイト列。UTF-8 として読むときは `convert_from(convert_to(col, 'SQL_ASCII'), 'UTF8')` を通す（不正なバイト列が混じる場合の扱いに注意）。
- このリポジトリは public。接続情報、IP アドレス、ホスト名、実際のジョブ名やファイル名をコードやテストデータに入れない。
