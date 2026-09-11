import { Trade } from "@/lib/api";

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Unlike formatDate (date-only fields, no time component), these take a full
// timestamp — used together so the date can be the prominent stat value and
// the time+timezone a smaller note underneath, in the viewer's local zone.
export function formatDateFromTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatTimeWithZone(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

// House's state_district ("MO04") is real and display-ready. Senate rows key
// members_reference by a synthetic "SEN:lastname" (Senate filings carry no
// district/state field) — not fit to show, so those use the joined state
// column from members_reference instead. Falls back to state_district if the
// state lookup hasn't matched (see README's Senate name-matching note).
export function memberLocation(trade: Trade): string | null {
  if (trade.chamber === "senate") return trade.member_state ?? trade.state_district;
  return trade.state_district;
}

export const compactUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function typeBadge(type: string): { label: string; className: string; accent: string } {
  const t = type.toUpperCase();
  if (t.startsWith("P"))
    return { label: "Purchase", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", accent: "border-l-emerald-500" };
  if (t.startsWith("S"))
    return {
      label: type.includes("partial") ? "Sale (partial)" : "Sale",
      className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      accent: "border-l-rose-500",
    };
  if (t.startsWith("E"))
    return { label: "Exchange", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30", accent: "border-l-amber-500" };
  return { label: type, className: "bg-ink-faint/10 text-ink-muted border-ink-faint/30", accent: "border-l-line-strong" };
}
