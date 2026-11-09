// Volume 帯の区間計算 (DB に依存しない純粋関数)。

export type JobMediaRow = {
  jobid: number;
  name: string;
  level: string;
  priorjobid?: number;
  jobbytes: number;
  startfile: number;
  startblock: number;
  endfile: number;
  endblock: number;
};

export type Segment = {
  kind: "single" | "split" | "free";
  bytes: number;
  jobid?: number;
  name?: string;
  level?: string;
  // 容量の根拠が推定 (テープなど) の区間
  estimated?: boolean;
  // Copy の関係: copyOf は原本の JobId (コピー自身のとき)、copiedTo はコピー先の JobId
  copyOf?: number;
  copiedTo?: number[];
};

const TWO32 = 2 ** 32;

// File ボリュームでは StartFile/StartBlock がバイト位置 ((file << 32) | block) を表す。
export const fileOffset = (file: number, block: number) => file * TWO32 + block;

// File ボリューム: 位置から区間を正確に出す。
// jobSplit: そのジョブが複数 Volume にまたがるか (jobid -> bool)
export function fileSegments(rows: JobMediaRow[], capacity: number, jobSplit: Map<number, boolean>): Segment[] {
  const sorted = rows
    .map((r) => ({ r, start: fileOffset(r.startfile, r.startblock), end: fileOffset(r.endfile, r.endblock) }))
    .sort((a, b) => a.start - b.start);
  const segs: Segment[] = [];
  let pos = 0;
  for (const { r, start, end } of sorted) {
    if (start > pos) segs.push({ kind: "free", bytes: start - pos });
    const from = Math.max(start, pos);
    const bytes = Math.max(0, end - from);
    if (bytes > 0) {
      const last = segs[segs.length - 1];
      if (last && last.kind !== "free" && last.jobid === r.jobid) last.bytes += bytes;
      else segs.push({ kind: jobSplit.get(r.jobid) ? "split" : "single", bytes, jobid: r.jobid, name: r.name, level: r.level });
    }
    pos = Math.max(pos, end);
  }
  if (capacity > pos) segs.push({ kind: "free", bytes: capacity - pos });
  return segs;
}

// テープ: 位置が物理バイトでないため、ジョブのバイト数をその Volume の行数で按分した推定。
// totalRows: jobid -> 全 Volume での JobMedia 行数
export function tapeSegments(rows: JobMediaRow[], capacity: number, totalRows: Map<number, number>, usedBytes: number): Segment[] {
  const order: number[] = [];
  const byJob = new Map<number, { row: JobMediaRow; n: number }>();
  for (const r of rows) {
    const cur = byJob.get(r.jobid);
    if (cur) cur.n += 1;
    else { byJob.set(r.jobid, { row: r, n: 1 }); order.push(r.jobid); }
  }
  let known = 0;
  const segs: Segment[] = [];
  for (const jobid of order) {
    const { row, n } = byJob.get(jobid)!;
    const total = totalRows.get(jobid) ?? n;
    const bytes = row.jobbytes * (n / total);
    known += bytes;
    segs.push({ kind: total > n ? "split" : "single", bytes, jobid, name: row.name, level: row.level, estimated: true });
  }
  // 実測の使用量 (VolBytes) に合わせて補正し、残りを空きにする
  const scale = known > 0 && usedBytes > 0 ? usedBytes / known : 1;
  for (const s of segs) s.bytes *= scale;
  const used = segs.reduce((a, s) => a + s.bytes, 0);
  if (capacity > used) segs.push({ kind: "free", bytes: capacity - used });
  return segs;
}
