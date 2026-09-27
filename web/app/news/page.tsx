import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NewsCard } from "@/components/NewsCard";
import { getGeneralNews } from "@/lib/newsFeed";
import { getPolicyFeed } from "@/lib/policyFeed";

export const metadata: Metadata = {
  title: "News | CongTrade",
  description:
    "Federal agency releases, plus economy and markets coverage from CNBC and MarketWatch, beside the congressional trading data they move.",
};

/**
 * Half an hour, matching the two API routes. Agencies publish a handful of
 * times a week and the wires a few times an hour, so a visitor arriving a
 * minute after a story breaks is not a case worth five outbound requests per
 * page view to serve.
 */
export const revalidate = 1800;

function Group({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
        <p className="text-xs text-ink-faint">{note}</p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export default async function NewsPage() {
  // Independent: one publisher being down shouldn't cost the others their
  // section, and both helpers already resolve to empty on failure.
  const [agencies, sections] = await Promise.all([getPolicyFeed(12), getGeneralNews(9)]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">News</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          What the disclosures on this site get traded around: the releases themselves, and the reporting on them. Every
          headline links to whoever published it. None of it is CongTrade&rsquo;s own writing.
        </p>

        {agencies.length > 0 && (
          <Group title="News from the agencies" note="Official releases, unedited">
            {agencies.map((item) => (
              <NewsCard key={item.url} item={item} />
            ))}
          </Group>
        )}

        {sections.map((section) => (
          <Group
            key={section.key}
            title={section.publisher}
            note={`${section.blurb} · published by ${section.publisher}`}
          >
            {section.items.map((item) => (
              <NewsCard key={item.url} item={item} accent={section.key === "cnbc" ? "accent" : "amber"} />
            ))}
          </Group>
        ))}

        {agencies.length === 0 && sections.length === 0 && (
          <p className="mt-10 rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-ink-muted">
            No headlines could be loaded just now. Every source here is someone else&rsquo;s server, and this page
            doesn&rsquo;t cache what it couldn&rsquo;t fetch.
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}
