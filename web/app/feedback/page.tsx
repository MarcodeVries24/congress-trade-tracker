import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FeedbackForm } from "@/components/FeedbackForm";

export const metadata: Metadata = {
  title: "Feedback | CongTrade",
  description: "Tell us what would make CongTrade better, or what went wrong.",
  alternates: { canonical: "/feedback" },
};

export default function FeedbackPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Send feedback</h1>
        <p className="mt-2 text-sm text-ink-muted">
          An idea, something that doesn&rsquo;t work, or a trade that looks wrong: we read every message. No
          account needed.
        </p>
        <FeedbackForm />
      </main>
      <Footer />
    </>
  );
}
