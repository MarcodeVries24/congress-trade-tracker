import { SITE_URL } from "@/lib/site";
import { TERMS_VERSION } from "@/lib/legal";

/**
 * The confirmation a web subscriber gets by email, as EU consumer law asks:
 * the contract confirmed on a durable medium, with the withdrawal information
 * and the model form, and (for US auto-renewal laws) what renews, for how
 * much, and how to cancel.
 *
 * Sent once, from the Stripe webhook's checkout.session.completed (each event
 * is claimed once). Never allowed to fail the webhook: the subscription has
 * to be recorded whatever happens to the email.
 *
 * Needs RESEND_API_KEY and ALERT_FROM_EMAIL (a verified sending address, the
 * same one alerts use) in the website's environment; without them it logs and
 * skips.
 */
export async function sendPurchaseConfirmation(details: {
  to: string;
  plan: string;
  amount: string;
  renews: Date | null;
  startNowRequestedAt: string | null;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL;
  if (!key || !from) {
    console.warn("purchase confirmation not sent: RESEND_API_KEY or ALERT_FROM_EMAIL is not set for the website");
    return;
  }
  const renews = details.renews ? details.renews.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
  const requested = details.startNowRequestedAt
    ? new Date(details.startNowRequestedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }) + " UTC"
    : null;

  const lines = [
    "Thank you for subscribing to CongTrade Pro.",
    "",
    `Plan: ${details.plan}`,
    `Price: ${details.amount}, renewing automatically until you cancel${renews ? ` (next renewal ${renews})` : ""}.`,
    `Cancel any time from your account (${SITE_URL}/account); you keep Pro until the end of the period you paid for.`,
    "",
    "Your right of withdrawal (EU and EEA consumers)",
    "You may withdraw from this contract within 14 days of the day it started, without giving a reason, by telling us at contact@congtrade.com in any clear statement or with the model form below." +
      (requested ? ` At checkout, on ${requested}, you asked for Pro to start straight away;` : " You asked for Pro to start straight away;") +
      " if you withdraw within the 14 days, you pay for the days you have already used and we refund the rest within 14 days, to the payment method you used.",
    "",
    "Model withdrawal form",
    "To CongTrade, contact@congtrade.com",
    "I hereby give notice that I withdraw from my contract for the supply of the following service: CongTrade Pro",
    "Ordered on: [date]",
    "Name of consumer: [your name]",
    "Address of consumer: [your address]",
    "Account email: [the address on your CongTrade account]",
    "Date: [today's date]",
    "",
    `These terms apply: ${SITE_URL}/terms (version of ${TERMS_VERSION}). Privacy Policy: ${SITE_URL}/privacy.`,
    "CongTrade is a service of MV Digital, Paterswoldseweg 102, 9727 BH Groningen, Netherlands. Chamber of Commerce 42025400, VAT NL005440118B52.",
  ];
  const text = lines.join("\n");
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;color:#111;line-height:1.5">${lines
    .map((l) => (l === "" ? "<br/>" : /^(Your right of withdrawal|Model withdrawal form)/.test(l) ? `<p style="margin:12px 0 4px"><strong>${escape(l)}</strong></p>` : `<p style="margin:0 0 6px">${escape(l)}</p>`))
    .join("")}</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: details.to, subject: "Your CongTrade Pro subscription", text, html }),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${await res.text()}`);
}
