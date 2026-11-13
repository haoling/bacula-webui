import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, ConfirmDialog, ErrorAlert } from "./Layout";
import { formatBytes } from "./format";

type DefinedJob = {
  name: string; type: string; enabled: boolean; running: boolean;
  schedule: string | null; scheduleEnabled: boolean | null;
};
type Progress = {
  jobid: number; name: string; level: string; files: number; bytes: number;
  status: string; expectedBytes: number | null; percent: number | null;
};
type Scheduled = { level: string; type: string; priority: number; when: string; job: string; schedule: string };

const LEVELS = ["Incremental", "Differential", "Full"] as const;
type Level = (typeof LEVELS)[number];

const getJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};
const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `${r.status}`);
  return data;
};

// 確認待ちの操作。null のときダイアログは閉じている。
type Pending =
  | { kind: "run"; job: DefinedJob; level: Level }
  | { kind: "toggle"; job: DefinedJob };

export function Control() {
  const qc = useQueryClient();
  const [level, setLevel] = useState<Record<string, Level>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const progress = useQuery({ queryKey: ["progress"], queryFn: () => getJson<Progress[]>("/api/progress"), refetchInterval: 5000 });
  const defined = useQuery({ queryKey: ["defined"], queryFn: () => getJson<DefinedJob[]>("/api/director/jobs"), refetchInterval: 15000 });
  const schedule = useQuery({ queryKey: ["schedule"], queryFn: () => getJson<Scheduled[]>("/api/schedule"), refetchInterval: 60000 });

  const act = useMutation({
    mutationFn: (p: Pending) =>
      p.kind === "run"
        ? post("/api/jobs/run", { job: p.job.name, level: p.level })
        : post(`/api/director/jobs/${encodeURIComponent(p.job.name)}/enabled`, { enabled: !p.job.enabled }),
    onSuccess: (_d, p) => {
      setNotice({ ok: true, text: p.kind === "run" ? `${p.job.name} を実行キューに入れました` : `${p.job.name} を${p.job.enabled ? "無効" : "有効"}にしました` });
      qc.invalidateQueries();
    },
    onError: (e: Error) => setNotice({ ok: false, text: e.message }),
    onSettled: () => setPending(null),
  });

  return (
    <>
      {notice && (
        <div role="alert" className={`alert alert-soft ${notice.ok ? "alert-success" : "alert-error"}`}>
          <span>{notice.text}</span>
          <button className="btn btn-xs btn-ghost" onClick={() => setNotice(null)}>閉じる</button>
        </div>
      )}
      {(progress.isError || defined.isError || schedule.isError) && <ErrorAlert>Director から情報を取得できませんでした</ErrorAlert>}

      <Card title="実行中のジョブ">
        {progress.data?.length === 0 && <p className="text-sm">実行中のジョブはありません</p>}
        {progress.data?.map((p) => (
          <div key={p.jobid} className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="font-bold">{p.name}</span>
              <span>Job {p.jobid} / {p.level} / {p.status}</span>
              <span className="ml-auto">
                {formatBytes(p.bytes)}{p.expectedBytes ? ` / 約 ${formatBytes(p.expectedBytes)}` : ""}・{p.files.toLocaleString()} ファイル
              </span>
            </div>
            {/* 総量は前回成功分からの推定。前回が無いときは不定の帯にする */}
            <div className="flex items-center gap-2">
              <progress className="progress progress-info flex-1" value={p.percent ?? undefined} max={100} />
              <span className="w-24 text-right text-sm">{p.percent !== null ? `約 ${p.percent}%` : "不明"}</span>
            </div>
          </div>
        ))}
      </Card>

      <Card title="ジョブ定義">
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead><tr><th>名前</th><th>スケジュール</th><th>状態</th><th>実行</th></tr></thead>
            <tbody>
              {defined.isLoading && <tr><td colSpan={4} className="text-center"><span className="loading loading-dots" /></td></tr>}
              {defined.data?.map((j) => (
                <tr key={j.name}>
                  <td>{j.name}{j.running && <span className="badge badge-sm badge-info ml-2">実行中</span>}</td>
                  <td>{j.schedule ?? "—"}{j.scheduleEnabled === false && <span className="badge badge-sm badge-ghost ml-2">スケジュール無効</span>}</td>
                  <td>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="toggle toggle-sm toggle-success" checked={j.enabled}
                             onChange={() => setPending({ kind: "toggle", job: j })} />
                      {j.enabled ? "有効" : "無効"}
                    </label>
                  </td>
                  <td>
                    {j.type === "B" && (
                      <div className="join">
                        <select className="select select-xs join-item w-auto" value={level[j.name] ?? "Incremental"}
                                onChange={(e) => setLevel({ ...level, [j.name]: e.target.value as Level })}>
                          {LEVELS.map((l) => <option key={l}>{l}</option>)}
                        </select>
                        <button className="btn btn-xs btn-primary join-item" disabled={!j.enabled || j.running}
                                onClick={() => setPending({ kind: "run", job: j, level: level[j.name] ?? "Incremental" })}>
                          実行
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs">有効/無効は Director のメモリ上の状態で、Director の再起動や設定の再読み込みで定義どおりに戻ります。</p>
      </Card>

      <Card title="今後の実行予定">
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead><tr><th>予定時刻</th><th>ジョブ</th><th>レベル</th><th>スケジュール</th></tr></thead>
            <tbody>
              {schedule.data?.map((s, i) => (
                <tr key={i}><td>{s.when}</td><td>{s.job}</td><td>{s.level}</td><td>{s.schedule}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "run" ? "ジョブを実行しますか?" : pending?.job.enabled ? "ジョブを無効にしますか?" : "ジョブを有効にしますか?"}
        confirmLabel={pending?.kind === "run" ? "実行する" : pending?.job.enabled ? "無効にする" : "有効にする"}
        danger={pending?.kind === "toggle" && pending.job.enabled}
        busy={act.isPending}
        onConfirm={() => pending && act.mutate(pending)}
        onCancel={() => setPending(null)}
      >
        {pending && <p>対象: <b>{pending.job.name}</b>{pending.kind === "run" && <>（{pending.level}）</>}</p>}
        {pending?.kind === "run" && <p>実際の Bacula Director でバックアップが始まります。</p>}
        {pending?.kind === "toggle" && pending.job.enabled && <p>無効にすると、スケジュールされた実行も手動実行も行われなくなります。</p>}
        {pending?.job.running && <p className="text-warning">このジョブは現在実行中です。実行中の分は止まりません。</p>}
      </ConfirmDialog>
    </>
  );
}
