import { Hono } from "hono";
import { bconsole, isSafeName } from "./bconsole.js";
import { pool } from "./db.js";

// テープの MaxVolBytes が 0 (無制限) のときの公称容量。volumes.ts と同じ値。
const NOMINAL: Record<string, number> = { LTO3: 400e9, LTO4: 800e9, LTO5: 1.5e12, LTO6: 2.5e12, LTO7: 6e12, LTO8: 12e12 };

// `status storage=NAME` の "Device ... (/path)" に続く "Available Space=535.7 GB" を読む。
// Bacula 9.6 の SD は File デバイスについてだけ、そのファイルシステムの空きを出す (テープでは出ない)。
const UNIT: Record<string, number> = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15 };
export function parseAvailableSpace(out: string): number | null {
  const m = /Available Space=([\d.,]+)\s*([KMGTP]?B)/.exec(out);
  if (!m) return null;
  return Math.round(Number(m[1].replaceAll(",", "")) * (UNIT[m[2]] ?? 1));
}

async function storageFree(name: string): Promise<number | null> {
  if (!isSafeName(name)) return null;
  try {
    return parseAvailableSpace(await bconsole([`status storage=${name}`]));
  } catch {
    return null;
  }
}

export const pools = new Hono();

// Pool ごとの容量サマリー。
//  - usedBytes: カタログの VolBytes の合計
//  - reusableBytes: Purged/Recycle の Volume の容量 (中身はもう不要で、書き直せる)
//  - appendFreeBytes: 追記中 (Append) の Volume の残り (容量 − VolBytes)
//  - unallocatedBytes: Pool の MaxVols まで未作成の Volume 分 (MaxVols と MaxVolBytes が両方決まっているときだけ)
//  - storages[].diskFreeBytes: その Pool の Volume が載る SD デバイスのファイルシステムの空き
pools.get("/api/pools", async (c) => {
  try {
    const poolRows = await pool.query(`SELECT poolid, name, maxvols, maxvolbytes FROM pool ORDER BY name`);
    const media = await pool.query(
      `SELECT m.poolid, m.volumename, m.volstatus, m.volbytes::float8 AS volbytes, m.maxvolbytes::float8 AS maxvolbytes,
              m.mediatype, s.name AS storage
         FROM media m LEFT JOIN storage s ON s.storageid = m.storageid`,
    );

    const storageNames = [...new Set(media.rows.map((m) => m.storage).filter(Boolean))] as string[];
    const free = new Map<string, number | null>();
    await Promise.all(storageNames.map(async (n) => free.set(n, await storageFree(n))));

    const result = [];
    for (const p of poolRows.rows) {
      const vols = media.rows.filter((m) => m.poolid === p.poolid);
      let used = 0, reusable = 0, appendFree = 0;
      for (const m of vols) {
        const poolMax = Number(p.maxvolbytes);
        const cap = m.maxvolbytes > 0 ? m.maxvolbytes : poolMax > 0 ? poolMax : (NOMINAL[m.mediatype] ?? 0);
        used += m.volbytes;
        if (m.volstatus === "Purged" || m.volstatus === "Recycle") reusable += Math.max(cap, 0);
        else if (m.volstatus === "Append") appendFree += Math.max(cap - m.volbytes, 0);
      }
      const maxvols = Number(p.maxvols), maxvolbytes = Number(p.maxvolbytes);
      const unallocated = maxvols > 0 && maxvolbytes > 0 ? Math.max(maxvols - vols.length, 0) * maxvolbytes : null;
      const storages = [...new Set(vols.map((m) => m.storage).filter(Boolean))] as string[];
      result.push({
        pool: p.name, volumes: vols.length, usedBytes: used,
        reusableBytes: reusable, appendFreeBytes: appendFree, unallocatedBytes: unallocated,
        storages: storages.map((name) => ({ name, diskFreeBytes: free.get(name) ?? null })),
      });
    }
    return c.json(result);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});
