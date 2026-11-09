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
