import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEEDBACK_KINDS } from "@congtrade/shared/feedback";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Link from "@/components/Link";
import { Cong } from "@/components/Cong";
import { FeedbackActions } from "@/components/admin/FeedbackActions";
import { adminUserId } from "@/lib/admin";
import { countFeedbackByStatus, FEEDBACK_STATUSES, listFeedback, type FeedbackStatus } from "@/lib/feedback";

export const metadata: Metadata = {
  title: "Feedback | CongTrade",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = { ios: "iPhone", android: "Android", web: "Website" };
const TAB_LABEL: Record<FeedbackStatus | "all", string> = { new: "New", read: "Read", done: "Done", all: "All" };

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

/** Feedback from the app and the website, newest first, for the admin only. */
export default async function FeedbackAdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!(await adminUserId())) notFound();

  const requested = (await searchParams).status;
  const tab: FeedbackStatus | "all" =
    requested === "all" || FEEDBACK_STATUSES.includes(requested as FeedbackStatus)
      ? (requested as FeedbackStatus | "all")
      : "new";
  const [rows, counts] = await Promise.all([listFeedback(tab === "all" ? null : tab), countFeedbackByStatus()]);
  const total = counts.new + counts.read + counts.done;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/admin" className="text-sm text-ink-muted hover:text-ink">
          ← Filings to approve
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Feedback</h1>
        <p className="mt-1 text-sm text-ink-muted">
          From the apps and the website. Each one is also emailed to the inbox; reply from there.
        </p>

        <nav className="mt-5 flex flex-wrap gap-2">
          {(["new", "read", "done", "all"] as const).map((t) => (
            <Link
              key={t}
              href={t === "new" ? "/admin/feedback" : `/admin/feedback?status=${t}`}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${
                t === tab ? "border-ink bg-ink text-panel" : "border-line text-ink-muted hover:text-ink"
              }`}
            >
              {TAB_LABEL[t]} ({t === "all" ? total : counts[t]})
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <div className="mt-10 text-center">
            <Cong mood="all-quiet" width={110} className="mx-auto" />
            <p className="mt-3 text-sm text-ink-muted">{tab === "new" ? "Nothing new." : "None here."}</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {rows.map((f) => (
              <section key={f.id} className="rounded-lg border border-line bg-panel p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                    {FEEDBACK_KINDS[f.kind] ?? f.kind}
                  </span>
                  <span className="text-xs text-ink-faint">
                    #{f.id} · {when(f.created_at)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{f.message}</p>
                <p className="mt-3 text-xs text-ink-faint">
                  {f.email ? (
                    <a href={`mailto:${f.email}`} className="font-medium text-accent hover:underline">
                      {f.email}
                    </a>
                  ) : (
                    "No reply address"
                  )}
                  {" · "}
                  {f.user_id ? "Signed in" : "No account"}
                  {" · "}
                  {SOURCE_LABEL[f.source] ?? f.source}
                  {f.app_version ? ` ${f.app_version}` : ""}
                  {f.os_version ? ` · OS ${f.os_version}` : ""}
                  {f.screen ? ` · from ${f.screen}` : ""}
                  {tab === "all" ? ` · ${TAB_LABEL[f.status]}` : ""}
                </p>
                <FeedbackActions id={f.id} status={f.status} note={f.note} />
              </section>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
