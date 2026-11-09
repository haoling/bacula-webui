import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, ErrorAlert } from "./Layout";
import { LEVEL, formatBytes, formatTime } from "./format";

type Segment = {
  kind: "single" | "split" | "free"; bytes: number;
  jobid?: number; name?: string; level?: string; estimated?: boolean;
  copyOf?: number; copiedTo?: number[];
};
type Volume = {
  mediaid: number; volumename: string; pool: string | null; status: string; mediatype: string;
  kind: "file" | "tape"; usedBytes: number; capacity: number; capacityEstimated: boolean;
  lastwritten: string | null; inchanger: boolean; slot: number; segments: Segment[];
  // 原本ジョブのうち、LTO などへコピー済みの割合 (none: 1 つもない / partial / all)
  copyState: "none" | "partial" | "all";
};

// 色: Volume 内に収まったジョブ / 別の Volume にまたがるジョブ / 空き
const FILL = { single: "bg-success", split: "bg-warning", free: "bg-base-300" } as const;
const LEGEND = [
  ["single", "Volume 内に収まったジョブ"],
  ["split", "別の Volume にまたがるジョブ"],
  ["free", "空き (Purge 済みを含む)"],
] as const;

// コピーの状態: コピー先がある原本 / コピー自身 / 未コピーの原本
const copyText = (s: Segment) =>
  s.copyOf ? ` / コピー (原本 Job ${s.copyOf})`
    : s.copiedTo && s.copiedTo.length > 0 ? ` / コピー済み (Job ${s.copiedTo.join(", ")})`
    : s.jobid !== undefined ? " / 未コピー" : "";

const segTitle = (s: Segment) =>
  s.kind === "free"
    ? `空き ${formatBytes(s.bytes)}`
    : `Job ${s.jobid} ${s.name} (${LEVEL[s.level ?? ""] ?? s.level}) ${formatBytes(s.bytes)}${s.estimated ? " ※推定" : ""}` +
      (s.kind === "split" ? " / 他の Volume にもまたがる" : "") + copyText(s);

function Bar({ v, onJob }: { v: Volume; onJob: (id: number) => void }) {
  return (
    <div className="border-base-300 flex h-5 w-full overflow-hidden rounded border">
      {v.segments.map((s, i) => (
        <div
          key={i}
          title={segTitle(s)}
          onClick={() => s.jobid && onJob(s.jobid)}
          className={`border-base-100 border-r ${FILL[s.kind]} ${s.jobid ? "cursor-pointer" : ""}`}
          style={{
            width: `${(s.bytes / v.capacity) * 100}%`,
            // 推定の区間は斜線で区別する
            backgroundImage: s.estimated
              ? "repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 4px, transparent 4px 8px)"
              : undefined,
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
    <>
      <Card title="Volume 使用状況">
        <div className="flex flex-wrap gap-4 text-sm">
          {LEGEND.map(([k, label]) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`inline-block size-3 rounded-sm ${FILL[k]}`} />{label}
            </span>
          ))}
          <span>斜線 = 推定 (テープ)</span>
        </div>
        {vols.isLoading && <span className="loading loading-dots" />}
        {vols.isError && <ErrorAlert>Volume 一覧を取得できませんでした</ErrorAlert>}
      </Card>
      {[...pools].map(([pool, list]) => (
        <Card key={pool} title={`${pool}（${list.length} 本）`}>
          {list.map((v) => {
            const free = v.segments.filter((s) => s.kind === "free").reduce((a, s) => a + s.bytes, 0);
            return (
              <div key={v.mediaid} className="space-y-1">
                <div className="flex cursor-pointer flex-wrap justify-between gap-x-4 text-sm"
                     onClick={() => setOpen(open === v.mediaid ? null : v.mediaid)}>
                  <b className="flex items-center gap-2">{v.volumename}
                    {v.copyState === "all" && <span className="badge badge-success badge-sm">全ジョブコピー済み → 削除可</span>}
                    {v.copyState === "partial" && <span className="badge badge-warning badge-sm">一部のみコピー済み</span>}
                  </b>
                  <span>{v.status} / {v.mediatype} / 使用 {formatBytes(v.usedBytes)} / 空き {formatBytes(free)}
                    {v.capacityEstimated ? "（容量は公称値）" : ""}</span>
                </div>
                <Bar v={v} onJob={onJob} />
                {open === v.mediaid && (
                  <div className="overflow-x-auto">
                    <p className="py-1 text-sm">最終書込: {formatTime(v.lastwritten)}{v.kind === "tape" ? ` / スロット ${v.slot}${v.inchanger ? " (チェンジャー内)" : ""}` : ""}</p>
                    <table className="table table-xs">
                      <tbody>
                        {v.segments.filter((s) => s.kind !== "free").map((s, i) => (
                          <tr key={i} onClick={() => s.jobid && onJob(s.jobid)} className="hover:bg-base-200 cursor-pointer">
                            <td>Job {s.jobid}</td><td>{s.name}</td>
                            <td>{LEVEL[s.level ?? ""] ?? s.level}</td>
                            <td>{formatBytes(s.bytes)}{s.estimated ? " ※推定" : ""}</td>
                            <td className={s.kind === "split" ? "text-warning" : ""}>{s.kind === "split" ? "他の Volume にもまたがる" : "収まっている"}</td>
                            <td className={s.copyOf ? "text-base-content/60" : s.copiedTo && s.copiedTo.length > 0 ? "text-success" : "text-error"}>{copyText(s).replace(/^ \/ /, "")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      ))}
    </>
  );
}
