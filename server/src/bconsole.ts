import { spawn } from "node:child_process";

// Bacula への操作は bconsole 経由のみ (カタログ DB は読み取り専用)。
// 設定ファイル (Director への接続情報・パスワード入り) は環境変数で場所だけ受け取り、Secret から渡す。
const CONFIG = process.env.BCONSOLE_CONFIG ?? "/etc/bacula/bconsole.conf";
const TIMEOUT_MS = 30_000;

// bconsole に渡すコマンドは 1 行 = 1 コマンド。改行や引用符が値に混じるとコマンドを注入できてしまうので、
// リソース名として使う文字列は必ずここを通す。
const NAME = /^[A-Za-z0-9._-]+$/;
export const isSafeName = (s: unknown): s is string => typeof s === "string" && NAME.test(s);

// シェルは経由せず (execFile 相当)、コマンドは stdin で渡す。最後に quit を付けて終了させる。
export function bconsole(commands: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    if (commands.some((c) => /[\r\n]/.test(c))) return reject(new Error("invalid command"));
    const p = spawn("bconsole", ["-n", "-c", CONFIG], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => { p.kill(); reject(new Error("bconsole timeout")); }, TIMEOUT_MS);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", () => {
      clearTimeout(timer);
      // 設定ファイルが無い・Director に繋がらないときは bconsole が何かを出して終了するだけで、
      // そのまま解析すると「空の一覧」に見えてしまう。接続成功の応答 (1000 OK) が無ければ失敗として扱う。
      if (!out.includes("1000 OK")) return reject(new Error(`bconsole failed: ${(err || out).trim().slice(0, 200)}`));
      resolve(out);
    });
    p.stdin.end(`${commands.join("\n")}\nquit\n`);
  });
}
