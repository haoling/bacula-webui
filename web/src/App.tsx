import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, ErrorAlert, Layout } from "./Layout";
import { Volumes } from "./Volumes";
import { LEVEL, formatBytes, formatDuration, formatTime, statusInfo, type StatusKind } from "./format";

type Job = {
  jobid: number; name: string; client: string | null; level: string;
  jobstatus: string; starttime: string | null; endtime: string | null;
  jobfiles: number; jobbytes: string;
};
type LogLine = { time: string; logtext: string };

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
  const [tab, setTab] = useState<"jobs" | "volumes">("jobs");
  const [selected, setSelected] = useState<number | null>(null);
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => getJson<Job[]>("/api/jobs"), refetchInterval: 10000 });
  const log = useQuery({
    queryKey: ["log", selected],
    queryFn: () => getJson<LogLine[]>(`/api/jobs/${selected}/log`),
    enabled: selected !== null,
  });
  return (
    <Layout
      tabs={[{ key: "jobs", label: "ジョブ" }, { key: "volumes", label: "Volume" }]}
      current={tab}
      onChange={setTab}
    >
      {tab === "volumes" && (
        <Volumes onJob={(id) => { setSelected(id); setTab("jobs"); }} />
      )}
      {tab === "jobs" && (<>
        {jobs.isError && <ErrorAlert>ジョブ一覧を取得できませんでした</ErrorAlert>}
        <Card title="ジョブ">
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
                {jobs.data?.map((j) => {
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
