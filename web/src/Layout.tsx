import type { ReactNode } from "react";

// 画面全体の枠。ナビゲーション (タブ) と本文の幅をここで一元管理する。
// 新しい画面は tabs に足して <Layout> の中に書けばよい。
export type Tab<K extends string> = { key: K; label: string };

export function Layout<K extends string>({ tabs, current, onChange, children }: {
  tabs: Tab<K>[]; current: K; onChange: (key: K) => void; children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-base-200">
      <header className="navbar bg-base-100 shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4">
          <span className="text-lg font-bold">Bacula</span>
          <nav role="tablist" className="tabs tabs-border">
            {tabs.map((t) => (
              <button key={t.key} role="tab" className={`tab ${t.key === current ? "tab-active" : ""}`}
                      onClick={() => onChange(t.key)}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl space-y-4 p-4">{children}</main>
    </div>
  );
}

// カード状のまとまり。見出しと本文をそろえるために使う。
export function Card({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        {title && <h2 className="card-title">{title}</h2>}
        {children}
      </div>
    </section>
  );
}

export function ErrorAlert({ children }: { children: ReactNode }) {
  return <div role="alert" className="alert alert-error alert-soft">{children}</div>;
}

// 実 Director を変更する操作の前に必ず出す確認ダイアログ。
// 確認を省略できないよう、操作の実行は onConfirm からしか呼べない作りにしている。
export function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, onConfirm, onCancel }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string;
  danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <dialog className={`modal ${open ? "modal-open" : ""}`}>
      <div className="modal-box">
        <h3 className="text-lg font-bold">{title}</h3>
        <div className="space-y-2 py-4">{children}</div>
        <div className="modal-action">
          <button className="btn" disabled={busy} onClick={onCancel}>やめる</button>
          <button className={`btn ${danger ? "btn-warning" : "btn-primary"}`} disabled={busy} onClick={onConfirm}>
            {busy && <span className="loading loading-spinner loading-xs" />}{confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
