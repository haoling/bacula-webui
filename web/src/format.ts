// Bacula の JobStatus コードの表示。未知のコードはそのまま出す。
export type StatusKind = "ok" | "warn" | "error" | "running" | "wait" | "cancel";

const STATUS: Record<string, { label: string; kind: StatusKind }> = {
  T: { label: "成功", kind: "ok" },
  W: { label: "警告つき成功", kind: "warn" },
  E: { label: "エラー", kind: "error" },
  e: { label: "エラー", kind: "error" },
  f: { label: "失敗", kind: "error" },
  A: { label: "キャンセル", kind: "cancel" },
  I: { label: "不完全", kind: "error" },
  D: { label: "差異あり", kind: "warn" },
  R: { label: "実行中", kind: "running" },
  C: { label: "待機中", kind: "wait" },
  F: { label: "クライアント待ち", kind: "wait" },
  S: { label: "ストレージ待ち", kind: "wait" },
  m: { label: "メディア待ち", kind: "wait" },
  M: { label: "マウント待ち", kind: "wait" },
  s: { label: "ストレージ待ち", kind: "wait" },
  j: { label: "ジョブ待ち", kind: "wait" },
  c: { label: "クライアント待ち", kind: "wait" },
  d: { label: "最大数待ち", kind: "wait" },
  t: { label: "開始時刻待ち", kind: "wait" },
  p: { label: "高優先度待ち", kind: "wait" },
  a: { label: "属性スプール中", kind: "running" },
  L: { label: "コミット中", kind: "running" },
  B: { label: "ブロック中", kind: "wait" },
};

export const statusInfo = (code: string) => STATUS[code] ?? { label: code, kind: "wait" as StatusKind };

export const LEVEL: Record<string, string> = { F: "Full", I: "増分", D: "差分", B: "ベース" };

// DB は UTC の ISO 文字列で返ってくるので、日本時間で表示する
export const formatTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      })
    : "—";

export const formatBytes = (value: string | number) => {
  let n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

// 実行中のジョブは終了時刻が未確定なので、現在時刻までの経過時間を出す
export const formatDuration = (start: string | null, end: string | null, running = false) => {
  if (!start) return "—";
  const endMs = running ? Date.now() : end ? new Date(end).getTime() : null;
  if (endMs === null) return "—";
  const s = Math.max(0, Math.round((endMs - new Date(start).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}時間${m}分` : m > 0 ? `${m}分${sec}秒` : `${sec}秒`;
};
