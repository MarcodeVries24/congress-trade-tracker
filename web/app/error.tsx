"use client";

import Link from "@/components/Link";
import { Cong } from "@/components/Cong";

/**
 * When a page fails to render. Without the header and footer on purpose:
 * they read the session and the plan, and an error page must not depend on
 * anything that might be what just failed.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center sm:py-24">
      <Cong mood="under-repair" width={140} />
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Something broke on our side</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Not you, us. Try again in a moment; if it keeps happening, email contact@congtrade.com.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          Go to the dashboard
        </Link>
      </div>
    </main>
  );
}
