import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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

const COLOR: Record<StatusKind, string> = {
  ok: "#1a7f37", warn: "#9a6700", error: "#cf222e", running: "#0969da", wait: "#6e7781", cancel: "#6e7781",
};

const th: React.CSSProperties = { textAlign: "left", padding: "4px 12px", borderBottom: "2px solid #d0d7de" };
const td: React.CSSProperties = { padding: "4px 12px", borderBottom: "1px solid #eaeef2" };

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
    <main style={{ fontFamily: "sans-serif", padding: 16 }}>
      <nav style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        <button onClick={() => setTab("jobs")} disabled={tab === "jobs"}>ジョブ</button>
        <button onClick={() => setTab("volumes")} disabled={tab === "volumes"}>Volume</button>
      </nav>
      {tab === "volumes" && (
        <Volumes onJob={(id) => { setSelected(id); setTab("jobs"); }} />
      )}
      {tab === "jobs" && (<>
      <h1>Bacula ジョブ</h1>
      {jobs.isError && <p style={{ color: COLOR.error }}>ジョブ一覧を取得できませんでした</p>}
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>ID</th><th style={th}>名前</th><th style={th}>Client</th><th style={th}>種別</th>
            <th style={th}>状態</th><th style={th}>開始</th><th style={th}>所要</th>
            <th style={th}>ファイル数</th><th style={th}>サイズ</th>
          </tr>
        </thead>
        <tbody>
          {jobs.data?.map((j) => {
            const st = statusInfo(j.jobstatus);
            return (
              <tr key={j.jobid} onClick={() => setSelected(j.jobid)}
                  style={{ cursor: "pointer", background: j.jobid === selected ? "#ddf4ff" : undefined }}>
                <td style={td}>{j.jobid}</td><td style={td}>{j.name}</td><td style={td}>{j.client}</td>
                <td style={td}>{LEVEL[j.level] ?? j.level}</td>
                <td style={{ ...td, color: COLOR[st.kind], fontWeight: 600 }}>{st.label}</td>
                <td style={td}>{formatTime(j.starttime)}</td>
                <td style={td}>{formatDuration(j.starttime, j.endtime, st.kind === "running")}</td>
                <td style={{ ...td, textAlign: "right" }}>{j.jobfiles.toLocaleString()}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatBytes(j.jobbytes)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selected !== null && (
        <section>
          <h2>Job {selected} のログ</h2>
          <pre style={{ background: "#f6f8fa", padding: 12, overflow: "auto" }}>
            {log.data?.map((l) => `${formatTime(l.time)} ${l.logtext}`).join("")}
          </pre>
        </section>
      )}
      </>)}
    </main>
  );
}
