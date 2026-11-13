import { Hono } from "hono";
import { bconsole, isSafeName } from "./bconsole.js";
import { pool } from "./db.js";

// ジョブの実行・進捗・スケジュール・有効/無効。Bacula への変更は bconsole のみで行う。
export const control = new Hono();

// 実行中・待機中を表す JobStatus コード (ここに該当するジョブは「動いている」とみなす)
const ACTIVE = ["R", "C", "F", "S", "m", "M", "s", "j", "c", "d", "t", "p", "a", "L", "B"];
const LEVELS = ["Full", "Incremental", "Differential"] as const;

type DefinedJob = {
  name: string; type: string; enabled: boolean;
  schedule: string | null; scheduleEnabled: boolean | null;
};

// `show jobs` の出力を読む。Director に定義されたジョブとその有効状態・スケジュールが取れる。
//   Job: name=X JobType=66 level=Full Priority=10 Enabled=1
//     --> Schedule: Name=DailyCycle Enabled=1
// 有効/無効は Director のメモリ上の状態で、設定の再読み込みや再起動で定義の値に戻る。
async function definedJobs(): Promise<DefinedJob[]> {
  const out = await bconsole(["show jobs"]);
  const list: DefinedJob[] = [];
  for (const line of out.split("\n")) {
    const h = /^Job: name=(\S+) JobType=(\d+) .*Enabled=(\d)/.exec(line);
    if (h) {
      list.push({ name: h[1], type: String.fromCharCode(Number(h[2])), enabled: h[3] === "1", schedule: null, scheduleEnabled: null });
      continue;
    }
    const s = /^\s+--> Schedule: Name=(\S+) Enabled=(\d)/.exec(line);
    if (s && list.length > 0) {
      list[list.length - 1].schedule = s[1];
      list[list.length - 1].scheduleEnabled = s[2] === "1";
    }
  }
  return list;
}

// 動いているジョブ名の集合 (カタログ DB から)
async function activeJobNames(): Promise<Set<string>> {
  const { rows } = await pool.query(`SELECT DISTINCT name FROM job WHERE jobstatus = ANY($1::char[])`, [ACTIVE]);
  return new Set(rows.map((r) => r.name as string));
}

control.get("/api/director/jobs", async (c) => {
  try {
    const [defs, active] = await Promise.all([definedJobs(), activeJobNames()]);
    return c.json(defs.map((d) => ({ ...d, running: active.has(d.name) })));
  } catch {
    return c.json({ error: "Director に接続できません" }, 502);
  }
});

// 今後の実行予定 (`status scheduled`)。日時は Director の表記のまま返す。
//   Incremental    Backup    10  Fri 13-Nov 20:00   JobName SchedName
control.get("/api/schedule", async (c) => {
  try {
    const out = await bconsole(["status scheduled"]);
    const rows = [];
    for (const line of out.split("\n")) {
      const m = /^(\S+)\s+(\S+)\s+(\d+)\s+(\w{3} \d{2}-\w{3} \d{2}:\d{2})\s+(\S+)\s+(\S+)\s*$/.exec(line);
      if (m) rows.push({ level: m[1], type: m[2], priority: Number(m[3]), when: m[4], job: m[5], schedule: m[6] });
    }
    return c.json(rows);
  } catch {
    return c.json({ error: "Director に接続できません" }, 502);
  }
});

// "1.2 G" / "5.568 M" / "1,234" → バイト数 (Bacula の接尾辞は 1024 進)
function parseBytes(s: string): number {
  const m = /^([\d.,]+)\s*([KMGTP]?)$/.exec(s.trim());
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ""));
  return n * 1024 ** ("KMGTP".indexOf(m[2]) + 1);
}

// 進捗: `status director` の Running Jobs からバイト数を読み、同じジョブ・同じレベルで
// 直近に成功した回のサイズを分母にした「推定」の割合を付ける (Bacula は総量を事前に知らない)。
//    JobId  Type Level     Files     Bytes  Name              Status
//      12  Back Full        123    1.2 G  JobName.2026-11-13_12.00.00_05 is running
const LEVEL_CODE: Record<string, string> = { Full: "F", Incr: "I", Diff: "D", Base: "B" };
control.get("/api/progress", async (c) => {
  try {
    const out = await bconsole(["status director"]);
    const section = out.split("Running Jobs:")[1]?.split("====\n")[0] ?? "";
    const running = [];
    for (const line of section.split("\n")) {
      const m = /^\s*(\d+)\s+(\S+)\s+(\S+)\s+([\d,]+)\s+([\d.,]+(?:\s?[KMGTP])?)\s+(\S+)\s+(.*)$/.exec(line);
      if (!m) continue;
      const name = m[6].replace(/\.\d{4}-\d{2}-\d{2}_.*$/, "");
      const bytes = parseBytes(m[5]);
      const level = LEVEL_CODE[m[3]] ?? m[3];
      const prev = await pool.query(
        `SELECT jobbytes FROM job WHERE name = $1 AND level = $2 AND jobstatus IN ('T','W') AND jobbytes > 0
          ORDER BY jobid DESC LIMIT 1`,
        [name, level],
      );
      const expected = prev.rows[0] ? Number(prev.rows[0].jobbytes) : null;
      running.push({
        jobid: Number(m[1]), name, level: m[3], files: Number(m[4].replace(/,/g, "")), bytes,
        status: m[7].trim(), expectedBytes: expected,
        percent: expected ? Math.min(99, Math.round((bytes / expected) * 100)) : null,
      });
    }
    return c.json(running);
  } catch {
    return c.json({ error: "Director に接続できません" }, 502);
  }
});

// ジョブ実行。ジョブ名は Director に定義されたものと完全一致するときだけ受け付け、
// 同名のジョブが動いている間は実行しない (二重実行で Volume やロックを取り合うため)。
control.post("/api/jobs/run", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { job, level } = body as { job?: unknown; level?: unknown };
  if (!isSafeName(job) || !LEVELS.includes(level as (typeof LEVELS)[number])) return c.json({ error: "bad request" }, 400);
  const target = (await definedJobs().catch(() => [])).find((d) => d.name === job);
  if (!target || target.type !== "B") return c.json({ error: "実行できるバックアップジョブではありません" }, 404);
  if ((await activeJobNames()).has(job)) return c.json({ error: "同名のジョブが実行中です" }, 409);
  const out = await bconsole([`run job=${job} level=${level} yes`]);
  return c.json({ ok: /Job queued|JobId=/.test(out), output: out });
});

// ジョブの有効/無効。無効にするとスケジュールからも手動実行からも外れる。
control.post("/api/director/jobs/:name/enabled", async (c) => {
  const name = c.req.param("name");
  const { enabled } = (await c.req.json().catch(() => ({}))) as { enabled?: unknown };
  if (!isSafeName(name) || typeof enabled !== "boolean") return c.json({ error: "bad request" }, 400);
  if (!(await definedJobs().catch(() => [])).some((d) => d.name === name)) return c.json({ error: "not found" }, 404);
  const out = await bconsole([`${enabled ? "enable" : "disable"} job=${name}`]);
  return c.json({ ok: /OK|enabled|disabled/i.test(out), output: out });
});
