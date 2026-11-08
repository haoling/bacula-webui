import pg from "pg";

// 接続情報は環境変数のみ (リポジトリに実値は置かない)。読み取り専用ロールを想定。
export const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? "bacula",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5,
});
