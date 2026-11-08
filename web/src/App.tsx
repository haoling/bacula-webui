import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

type Job = {
  jobid: number; name: string; client: string | null; level: string;
  jobstatus: string; starttime: string | null; jobfiles: number; jobbytes: string;
};
type LogLine = { time: string; logtext: string };

const getJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};

export function App() {
  const [selected, setSelected] = useState<number | null>(null);
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => getJson<Job[]>("/api/jobs"), refetchInterval: 10000 });
  const log = useQuery({
    queryKey: ["log", selected],
    queryFn: () => getJson<LogLine[]>(`/api/jobs/${selected}/log`),
    enabled: selected !== null,
  });
  return (
    <main style={{ fontFamily: "sans-serif", padding: 16 }}>
      <h1>Bacula ジョブ</h1>
      <table>
        <thead><tr><th>ID</th><th>名前</th><th>Client</th><th>Level</th><th>状態</th><th>開始</th><th>ファイル数</th></tr></thead>
        <tbody>
          {jobs.data?.map((j) => (
            <tr key={j.jobid} onClick={() => setSelected(j.jobid)} style={{ cursor: "pointer" }}>
              <td>{j.jobid}</td><td>{j.name}</td><td>{j.client}</td><td>{j.level}</td>
              <td>{j.jobstatus}</td><td>{j.starttime}</td><td>{j.jobfiles}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected !== null && (
        <section>
          <h2>Job {selected} のログ</h2>
          <pre>{log.data?.map((l) => `${l.time} ${l.logtext}`).join("")}</pre>
        </section>
      )}
    </main>
  );
}
