import { Hono } from "hono";
import { pool } from "./db.js";
import { fileSegments, tapeSegments, type JobMediaRow } from "./segments.js";

// テープの MaxVolBytes が 0 (無制限) のときの公称容量 (非圧縮)
const NOMINAL: Record<string, number> = { LTO3: 400e9, LTO4: 800e9, LTO5: 1.5e12, LTO6: 2.5e12, LTO7: 6e12, LTO8: 12e12 };

export const volumes = new Hono();

// Volume 一覧と、Volume ごとの使用状況の帯 (区間) を返す。
volumes.get("/api/volumes", async (c) => {
  const media = await pool.query(
    `SELECT m.mediaid, m.volumename, m.volstatus, m.volbytes, m.maxvolbytes, m.mediatype, m.voltype,
            m.lastwritten, m.inchanger, m.slot, p.name AS pool
       FROM media m LEFT JOIN pool p USING (poolid)
      ORDER BY p.name, m.mediaid`,
  );
  const jm = await pool.query(
    `SELECT jm.mediaid, jm.jobid, j.name, j.level, j.priorjobid, j.jobbytes::float8 AS jobbytes,
            jm.startfile::float8 AS startfile, jm.startblock::float8 AS startblock,
            jm.endfile::float8 AS endfile, jm.endblock::float8 AS endblock
       FROM jobmedia jm JOIN job j USING (jobid)
      ORDER BY jm.mediaid, jm.jobmediaid`,
  );

  // Copy で作られたジョブ (Type C、原本を purge すると B に昇格) は PriorJobId に原本を持つ。
  // 「原本 JobId -> コピー先 JobId」を、正常終了したコピーだけで作る。
  const copies = await pool.query(
    `SELECT jobid, priorjobid FROM job WHERE priorjobid > 0 AND jobstatus IN ('T', 'W')`,
  );
  const copiedTo = new Map<number, number[]>();
  for (const r of copies.rows) copiedTo.set(r.priorjobid, [...(copiedTo.get(r.priorjobid) ?? []), r.jobid]);
  const priorOf = new Map<number, number>();
  for (const r of jm.rows) if (r.priorjobid > 0) priorOf.set(r.jobid, r.priorjobid);

  const rowsByMedia = new Map<number, JobMediaRow[]>();
  const volumesOfJob = new Map<number, Set<number>>();
  const rowCountOfJob = new Map<number, number>();
  for (const r of jm.rows) {
    const list = rowsByMedia.get(r.mediaid) ?? [];
    list.push(r);
    rowsByMedia.set(r.mediaid, list);
    const set = volumesOfJob.get(r.jobid) ?? new Set<number>();
    set.add(r.mediaid);
    volumesOfJob.set(r.jobid, set);
    rowCountOfJob.set(r.jobid, (rowCountOfJob.get(r.jobid) ?? 0) + 1);
  }
  const jobSplit = new Map<number, boolean>();
  for (const [jobid, set] of volumesOfJob) jobSplit.set(jobid, set.size > 1);

  const result = media.rows.map((m) => {
    const isFile = m.mediatype === "File" || m.voltype === 1;
    const used = Number(m.volbytes);
    const max = Number(m.maxvolbytes);
    const nominal = NOMINAL[m.mediatype as string] ?? 0;
    // 容量: 上限が決まっていればそれ、なければ公称容量、なければ実使用量
    const capacity = max > 0 ? max : nominal > 0 ? nominal : used;
    const rows = rowsByMedia.get(m.mediaid) ?? [];
    const purged = m.volstatus === "Purged" || m.volstatus === "Recycle";
    const segments = purged
      ? [{ kind: "free" as const, bytes: Math.max(capacity, used) }]
      : isFile
        ? fileSegments(rows, Math.max(capacity, used), jobSplit)
        : tapeSegments(rows, Math.max(capacity, used), rowCountOfJob, used);
    // コピー情報を区間に付ける。コピー自身 (PriorJobId あり) は対象外。
    const withCopy = segments.map((seg) =>
      seg.jobid === undefined
        ? seg
        : { ...seg, copyOf: priorOf.get(seg.jobid) ?? 0, copiedTo: copiedTo.get(seg.jobid) ?? [] },
    );
    const originals = withCopy.filter((seg) => seg.jobid !== undefined && !seg.copyOf);
    // 原本ジョブがすべてコピー済みなら、Volume を空けても失うデータは無い
    const copyState =
      originals.length === 0 ? "none" : originals.every((seg) => (seg.copiedTo?.length ?? 0) > 0) ? "all"
        : originals.some((seg) => (seg.copiedTo?.length ?? 0) > 0) ? "partial" : "none";
    return {
      mediaid: m.mediaid, volumename: m.volumename, pool: m.pool, status: m.volstatus,
      mediatype: m.mediatype, kind: isFile ? "file" : "tape", usedBytes: used,
      capacity: Math.max(capacity, used), capacityEstimated: max <= 0 && !isFile,
      lastwritten: m.lastwritten, inchanger: !!m.inchanger, slot: m.slot, segments: withCopy, copyState,
    };
  });
  return c.json(result);
});
