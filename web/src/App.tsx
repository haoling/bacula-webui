import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, ErrorAlert, Layout } from "./Layout";
import { Control } from "./Control";
import { Volumes } from "./Volumes";
import { LEVEL, formatBytes, formatDuration, formatTime, statusInfo, type StatusKind } from "./format";

type Job = {
  jobid: number; name: string; client: string | null; level: string;
  jobstatus: string; starttime: string | null; endtime: string | null;
  jobfiles: number; jobbytes: string;
};
type LogLine = { time: string; logtext: string };
type JobPage = { total: number; rows: Job[] };

const PAGE_SIZE = 50;

// 状態の絞り込み。値は Bacula の JobStatus コード (カンマ区切りで複数)
const STATUS_FILTER = [
  ["", "すべての状態"], ["T", "成功"], ["W", "警告つき成功"], ["E,e,f,I", "エラー・失敗"],
  ["R", "実行中"], ["A", "キャンセル"],
] as const;

// 入力のたびに API を叩かないよう、入力が止まってから反映する
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const getJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};

// 状態の種別 → daisyUI のバッジ色
const BADGE: Record<StatusKind, string> = {
  ok: "badge-success", warn: "badge-warning", error: "badge-error",
  running: "badge-info", wait: "badge-ghost", cancel: "badge-ghost",
};

export function App() {
  const [tab, setTab] = useState<"jobs" | "control" | "volumes">("jobs");
  const [selected, setSelected] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [clientInput, setClientInput] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const name = useDebounced(nameInput);
  const client = useDebounced(clientInput);
  // 絞り込み条件が変わったら先頭ページに戻す
  useEffect(() => setPage(0), [name, client, status]);

  const jobs = useQuery({
    queryKey: ["jobs", name, client, status, page],
    queryFn: () => {
      const q = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (name) q.set("name", name);
      if (client) q.set("client", client);
      if (status) q.set("status", status);
      return getJson<JobPage>(`/api/jobs?${q}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: 10000,
  });
  const totalPages = Math.max(1, Math.ceil((jobs.data?.total ?? 0) / PAGE_SIZE));
  // 実行中のジョブのログは増え続けるので、一覧にいる間は定期的に取り直す
  const selectedRunning = jobs.data?.rows.some((j) => j.jobid === selected && statusInfo(j.jobstatus).kind === "running");
  const log = useQuery({
    queryKey: ["log", selected],
    queryFn: () => getJson<LogLine[]>(`/api/jobs/${selected}/log`),
    enabled: selected !== null,
    refetchInterval: selectedRunning ? 5000 : false,
  });
  return (
    <Layout
      tabs={[{ key: "jobs", label: "ジョブ" }, { key: "control", label: "実行・スケジュール" }, { key: "volumes", label: "Volume" }]}
      current={tab}
      onChange={setTab}
    >
      {tab === "control" && <Control />}
      {tab === "volumes" && (
        <Volumes onJob={(id) => { setSelected(id); setTab("jobs"); }} />
      )}
      {tab === "jobs" && (<>
        {jobs.isError && <ErrorAlert>ジョブ一覧を取得できませんでした</ErrorAlert>}
        <Card title="ジョブ">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input input-sm" placeholder="ジョブ名" value={nameInput}
                   onChange={(e) => setNameInput(e.target.value)} />
            <input className="input input-sm" placeholder="Client" value={clientInput}
                   onChange={(e) => setClientInput(e.target.value)} />
            <select className="select select-sm w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_FILTER.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <span className="ml-auto text-sm">{jobs.data ? `${jobs.data.total.toLocaleString()} 件` : ""}</span>
            <div className="join">
              <button className="btn btn-sm join-item" disabled={page === 0} onClick={() => setPage(page - 1)}>前へ</button>
              <span className="btn btn-sm join-item pointer-events-none">{page + 1} / {totalPages}</span>
              <button className="btn btn-sm join-item" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>次へ</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>ID</th><th>名前</th><th>Client</th><th>種別</th>
                  <th>状態</th><th>開始</th><th>所要</th>
                  <th className="text-right">ファイル数</th><th className="text-right">サイズ</th>
                </tr>
              </thead>
              <tbody>
                {jobs.isLoading && <tr><td colSpan={9} className="text-center"><span className="loading loading-dots" /></td></tr>}
                {jobs.data?.rows.map((j) => {
                  const st = statusInfo(j.jobstatus);
                  return (
                    <tr key={j.jobid} onClick={() => setSelected(j.jobid)}
                        className={`hover:bg-base-200 cursor-pointer ${j.jobid === selected ? "bg-primary/10" : ""}`}>
                      <td>{j.jobid}</td><td>{j.name}</td><td>{j.client}</td>
                      <td>{LEVEL[j.level] ?? j.level}</td>
                      <td><span className={`badge badge-sm ${BADGE[st.kind]}`}>{st.label}</span></td>
                      <td>{formatTime(j.starttime)}</td>
                      <td>{formatDuration(j.starttime, j.endtime, st.kind === "running")}</td>
                      <td className="text-right">{j.jobfiles.toLocaleString()}</td>
                      <td className="text-right">{formatBytes(j.jobbytes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        {selected !== null && (
          <Card title={`Job ${selected} のログ`}>
            {log.isLoading && <span className="loading loading-dots" />}
            {log.isError && <ErrorAlert>ログを取得できませんでした</ErrorAlert>}
            <pre className="bg-base-200 max-h-96 overflow-auto rounded-box p-3 text-xs">
              {log.data?.map((l) => `${formatTime(l.time)} ${l.logtext}`).join("")}
            </pre>
          </Card>
        )}
      </>)}
    </Layout>
  );
}
