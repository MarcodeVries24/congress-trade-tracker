// Thin wrapper around Resend's HTTP API — deliberately generic (not tied to
// the daily ingest report) since the plan is to reuse this same primitive
// for end-user-facing notifications later. Raw fetch rather than Resend's
// SDK, consistent with how every other external API in this project
// (Finnhub, the House Clerk, Senate eFD) is called — one fewer dependency.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_API_URL = "https://api.resend.com/emails";

// Resend's sandbox sender — works without owning/verifying a domain, but
// can only deliver to the email address that owns the Resend account. Fine
// for an admin report sent to yourself; sending to end users later will
// need a verified custom domain (see README) and a "from" address on it.
const DEFAULT_FROM = "CongTrade <onboarding@resend.dev>";

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set. Get a free key at https://resend.com and set it in ingest/.env (or as a GitHub Actions secret).");
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: message.from ?? DEFAULT_FROM,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend request failed: ${res.status} ${body}`);
  }
}
