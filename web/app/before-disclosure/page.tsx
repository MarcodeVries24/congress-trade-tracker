import { permanentRedirect } from "next/navigation";

/** The ranking's first address, kept so links to it still land. */
export default async function BeforeDisclosureRedirect({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days } = await searchParams;
  permanentRedirect(days ? `/best-trades?days=${encodeURIComponent(days)}` : "/best-trades");
}
