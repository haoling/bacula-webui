import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LEVEL, formatBytes, formatTime } from "./format";

type Segment = {
  kind: "single" | "split" | "free"; bytes: number;
  jobid?: number; name?: string; level?: string; estimated?: boolean;
};
type Volume = {
  mediaid: number; volumename: string; pool: string | null; status: string; mediatype: string;
  kind: "file" | "tape"; usedBytes: number; capacity: number; capacityEstimated: boolean;
  lastwritten: string | null; inchanger: boolean; slot: number; segments: Segment[];
};

// 色: Volume 内に収まったジョブ / 別の Volume にまたがるジョブ / 空き
const FILL = { single: "#2da44e", split: "#d4a72c", free: "#d8dee4" } as const;
const LEGEND = [
  ["single", "Volume 内に収まったジョブ"],
  ["split", "別の Volume にまたがるジョブ"],
  ["free", "空き (Purge 済みを含む)"],
] as const;

const segTitle = (s: Segment) =>
  s.kind === "free"
    ? `空き ${formatBytes(s.bytes)}`
    : `Job ${s.jobid} ${s.name} (${LEVEL[s.level ?? ""] ?? s.level}) ${formatBytes(s.bytes)}${s.estimated ? " ※推定" : ""}` +
      (s.kind === "split" ? " / 他の Volume にもまたがる" : "");

function Bar({ v, onJob }: { v: Volume; onJob: (id: number) => void }) {
  return (
    <div style={{ display: "flex", height: 22, width: "100%", border: "1px solid #d0d7de", borderRadius: 3, overflow: "hidden" }}>
      {v.segments.map((s, i) => (
        <div
          key={i}
          title={segTitle(s)}
          onClick={() => s.jobid && onJob(s.jobid)}
          style={{
            width: `${(s.bytes / v.capacity) * 100}%`,
            background: FILL[s.kind],
            // 推定の区間は斜線で区別する
            backgroundImage: s.estimated
              ? "repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 4px, transparent 4px 8px)"
              : undefined,
            borderRight: "1px solid #fff",
            cursor: s.jobid ? "pointer" : "default",
            minWidth: s.bytes > 0 ? 1 : 0,
          }}
        />
      ))}
    </div>
  );
}

export function Volumes({ onJob }: { onJob: (id: number) => void }) {
  const vols = useQuery({ queryKey: ["volumes"], queryFn: async () => {
    const r = await fetch("/api/volumes");
    if (!r.ok) throw new Error(`${r.status}`);
    return (await r.json()) as Volume[];
  } });
  const [open, setOpen] = useState<number | null>(null);

  const pools = new Map<string, Volume[]>();
  for (const v of vols.data ?? []) {
    const key = v.pool ?? "(Pool なし)";
    pools.set(key, [...(pools.get(key) ?? []), v]);
  }

  return (
    <section>
      <h1>Volume 使用状況</h1>
      <p style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {LEGEND.map(([k, label]) => (
          <span key={k}><span style={{ display: "inline-block", width: 12, height: 12, background: FILL[k], marginRight: 4 }} />{label}</span>
        ))}
        <span>斜線 = 推定 (テープ)</span>
      </p>
      {vols.isLoading && <p>読み込み中…</p>}
      {vols.isError && <p style={{ color: "#cf222e" }}>Volume 一覧を取得できませんでした</p>}
      {[...pools].map(([pool, list]) => (
        <div key={pool} style={{ marginBottom: 24 }}>
          <h2>{pool}（{list.length} 本）</h2>
          {list.map((v) => {
            const free = v.segments.filter((s) => s.kind === "free").reduce((a, s) => a + s.bytes, 0);
            return (
              <div key={v.mediaid} style={{ margin: "6px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, cursor: "pointer" }}
                     onClick={() => setOpen(open === v.mediaid ? null : v.mediaid)}>
                  <b>{v.volumename}</b>
                  <span>{v.status} / {v.mediatype} / 使用 {formatBytes(v.usedBytes)} / 空き {formatBytes(free)}
                    {v.capacityEstimated ? "（容量は公称値）" : ""}</span>
                </div>
                <Bar v={v} onJob={onJob} />
                {open === v.mediaid && (
                  <table style={{ fontSize: 13, margin: "6px 0" }}>
                    <tbody>
                      <tr><td colSpan={4}>最終書込: {formatTime(v.lastwritten)}{v.kind === "tape" ? ` / スロット ${v.slot}${v.inchanger ? " (チェンジャー内)" : ""}` : ""}</td></tr>
                      {v.segments.filter((s) => s.kind !== "free").map((s, i) => (
                        <tr key={i} onClick={() => s.jobid && onJob(s.jobid)} style={{ cursor: "pointer" }}>
                          <td style={{ padding: "0 8px" }}>Job {s.jobid}</td><td style={{ padding: "0 8px" }}>{s.name}</td>
                          <td style={{ padding: "0 8px" }}>{formatBytes(s.bytes)}{s.estimated ? " ※推定" : ""}</td>
                          <td style={{ padding: "0 8px", color: s.kind === "split" ? "#9a6700" : undefined }}>{s.kind === "split" ? "他の Volume にもまたがる" : "収まっている"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
