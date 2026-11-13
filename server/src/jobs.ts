import { Hono } from "hono";
import { pool } from "./db.js";

export const jobs = new Hono();

// ジョブ一覧 (新しい順)。ページングと絞り込みに対応する。
//   limit (既定 50, 最大 200) / offset / name / client (部分一致) / status (JobStatus コードのカンマ区切り)
// Job.Name 等は ASCII 想定。WHERE には固定の断片だけを連結し、値は必ずパラメータで渡す。
jobs.get("/api/jobs", async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
  const name = c.req.query("name") ?? "";
  const client = c.req.query("client") ?? "";
  const statuses = (c.req.query("status") ?? "").split(",").filter((s) => s.length === 1);

  const where: string[] = [];
  const params: unknown[] = [];
  // LIKE のワイルドカードを意識しなくて済むよう、部分一致は strpos で行う
  if (name) {
    params.push(name);
    where.push(`strpos(lower(j.name), lower($${params.length})) > 0`);
  }
  if (client) {
    params.push(client);
    where.push(`strpos(lower(c.name), lower($${params.length})) > 0`);
  }
  if (statuses.length > 0) {
    params.push(statuses);
    where.push(`j.jobstatus = ANY($${params.length}::char[])`);
  }
  const from = `FROM job j LEFT JOIN client c USING (clientid) ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}`;

  const total = await pool.query(`SELECT count(*)::int AS n ${from}`, params);
  const { rows } = await pool.query(
    `SELECT j.jobid, j.name, j.type, j.level, j.jobstatus,
            j.starttime, j.endtime, j.jobfiles, j.jobbytes, c.name AS client
       ${from}
      ORDER BY j.jobid DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  return c.json({ total: total.rows[0].n as number, rows });
});

// ジョブログ。DB は SQL_ASCII なので生のバイト列で受け取り、Node 側で UTF-8 として読む。
// SQL の convert_from は不正なバイト列が 1 つあるとクエリ全体が失敗するが、
// TextDecoder は不正な箇所だけ U+FFFD に置き換えて読み進められる。
const utf8 = new TextDecoder("utf-8");
jobs.get("/api/jobs/:id/log", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  const { rows } = await pool.query(
    `SELECT time, convert_to(logtext, 'SQL_ASCII') AS logtext
       FROM log WHERE jobid = $1 ORDER BY time, logid`,
    [id],
  );
  return c.json(rows.map((r) => ({ time: r.time, logtext: utf8.decode(r.logtext as Buffer) })));
});
