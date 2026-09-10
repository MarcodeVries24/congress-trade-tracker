import type { ReactNode } from "react";

export function LegalDocument({ title, lastUpdated, children }: { title: string; lastUpdated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
      <p className="mt-1.5 text-xs text-ink-faint">Last updated: {lastUpdated}</p>
      <div className="mt-8 space-y-8">{children}</div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-ink-muted [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
