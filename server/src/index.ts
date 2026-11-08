import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { pool } from "./db.js";

// 認証は前段の common-auth (forwardAuth) に任せる。アプリ自体にログインは持たない。
const app = new Hono();

app.get("/healthz", (c) => c.text("ok"));

// ジョブ一覧 (新しい順)。Job.Name 等は ASCII 想定。
app.get("/api/jobs", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const { rows } = await pool.query(
    `SELECT j.jobid, j.name, j.type, j.level, j.jobstatus,
            j.starttime, j.endtime, j.jobfiles, j.jobbytes, c.name AS client
       FROM job j LEFT JOIN client c USING (clientid)
      ORDER BY j.jobid DESC LIMIT $1`,
    [limit],
  );
  return c.json(rows);
});

// ジョブログ。DB は SQL_ASCII なので bytea 経由で UTF-8 として読む。
app.get("/api/jobs/:id/log", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  const { rows } = await pool.query(
    `SELECT time, convert_from(convert_to(logtext, 'SQL_ASCII'), 'UTF8') AS logtext
       FROM log WHERE jobid = $1 ORDER BY time, logid`,
    [id],
  );
  return c.json(rows);
});

app.use("/*", serveStatic({ root: "./public" }));
app.get("*", serveStatic({ path: "./public/index.html" }));

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8080) });
