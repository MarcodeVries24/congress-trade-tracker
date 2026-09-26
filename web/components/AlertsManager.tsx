"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ALERT_FREQUENCIES, describeAlert } from "@/lib/alertFilters";
import { AlertFilters, summarizeAlert } from "@/lib/alertFilters";
import { AlertsResponse, SavedAlert, alertUpgradeHref, createAlert, deleteAlert, fetchAlerts, readAlertDraft, updateAlert } from "@/lib/alertsClient";
import { formatDateFromTimestamp } from "@/lib/format";
import { AlertDraft, AlertEditor } from "./AlertEditor";

function frequencyLabel(value: string): string {
  return ALERT_FREQUENCIES.find((f) => f.value === value)?.label ?? value;
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-line bg-panel-muted px-2 py-0.5 text-xs text-ink-muted">{children}</span>;
}

/**
 * The alerts half of the account screen: what you're subscribed to, whether
 * it's running, and what it has actually sent.
 *
 * Deliberately shows the counters even when they're zero — an alert that has
 * matched nothing for a month is the single most common thing a user will
 * want to notice, and it's invisible if the row only renders on success.
 */
export function AlertsManager() {
  const [state, setState] = useState<AlertsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SavedAlert | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filters handed over from the trades page (see AlertCta). Read from
  // window rather than useSearchParams so this component never forces a
  // Suspense boundary on the page that renders it.
  const [draft, setDraft] = useState<AlertFilters | undefined>(undefined);

  useEffect(() => {
    const handover = readAlertDraft(window.location.search);
    // Kept whether or not they can save it: a free visitor doesn't get the
    // editor, but the upsell below hands their draft on to checkout, so what
    // they were half-way through building isn't lost at the till.
    if (handover) setDraft(handover);
    fetchAlerts()
      .then((loaded) => {
        setState(loaded);
        // Only open the editor for someone who can actually save — a free
        // visitor arriving on this link sees the upsell instead of a form
        // that would 403 on submit.
        if (handover && loaded.isPro) setEditing("new");
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  async function handleSave(draft: AlertDraft) {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing === "new") {
        const { alert } = await createAlert(draft);
        setState((s) => (s ? { ...s, alerts: [alert, ...s.alerts] } : s));
      } else if (editing) {
        const { alert } = await updateAlert(editing.id, draft);
        setState((s) => (s ? { ...s, alerts: s.alerts.map((a) => (a.id === alert.id ? alert : a)) } : s));
      }
      setEditing(null);
      setDraft(undefined);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(alert: SavedAlert) {
    setBusyId(alert.id);
    try {
      const { alert: updated } = await updateAlert(alert.id, { active: !alert.active });
      setState((s) => (s ? { ...s, alerts: s.alerts.map((a) => (a.id === updated.id ? updated : a)) } : s));
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(alert: SavedAlert) {
    if (!confirm(`Delete “${alert.name}”? This can't be undone.`)) return;
    setBusyId(alert.id);
    try {
      await deleteAlert(alert.id);
      setState((s) => (s ? { ...s, alerts: s.alerts.filter((a) => a.id !== alert.id) } : s));
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (loadError) return <p className="mt-4 text-sm text-red-500">{loadError}</p>;
  if (!state) return <p className="mt-4 text-sm text-ink-faint">Loading your alerts…</p>;

  const atLimit = state.alerts.length >= state.maxAlerts;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {state.email ? (
            <>
              Delivered to <span className="text-ink">{state.email}</span> — change it in your profile and it follows.
            </>
          ) : (
            "Add an email address to your account to receive alerts."
          )}
        </p>
        {state.isPro && (
          <button
            type="button"
            disabled={atLimit}
            onClick={() => {
              setSaveError(null);
              setEditing("new");
            }}
            title={atLimit ? `You can have up to ${state.maxAlerts} alerts.` : undefined}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            New alert
          </button>
        )}
      </div>

      {!state.isPro && (
        <div className="mt-4 rounded-lg border border-line bg-panel p-5">
          <h3 className="text-sm font-semibold text-ink">Email alerts are a CongTrade Pro feature</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Build a filter as specific as you like — a chamber, a party, a member, a ticker, a minimum trade size — and get
            an email the moment a new disclosure matches it.
          </p>
          {/* Carries a draft they arrived with through checkout, which hands
              it back to this page afterwards — the same handover the trades
              page uses, so upgrading finishes the alert they started. */}
          <Link
            href={draft ? alertUpgradeHref(draft) : "/upgrade"}
            className="mt-4 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Upgrade to Pro
          </Link>
        </div>
      )}

      {state.isPro && state.alerts.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink-muted">No alerts yet.</p>
          <p className="mt-1 text-xs text-ink-faint">
            Try “House purchases over $50,001”, or every trade in a ticker you follow.
          </p>
        </div>
      )}

      {state.alerts.length > 0 && (
        <ul className="mt-4 space-y-3">
          {state.alerts.map((alert) => (
            <li key={alert.id} className={`rounded-lg border border-line bg-panel p-4 ${alert.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-ink">{alert.name}</h3>
                    {!alert.active && <Chip>{alert.paused_reason === "subscription-ended" ? "Paused — Pro ended" : "Paused"}</Chip>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {describeAlert(alert.filters).map((chip) => (
                      <Chip key={chip}>{chip}</Chip>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Resuming needs Pro (the server enforces it too) — offering
                      a Resume button that can only ever 403 would be a worse
                      answer than pointing at the thing that fixes it. */}
                  {alert.active || state.isPro ? (
                    <button
                      type="button"
                      disabled={busyId === alert.id}
                      onClick={() => toggleActive(alert)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-50"
                    >
                      {alert.active ? "Pause" : "Resume"}
                    </button>
                  ) : (
                    <Link
                      href="/upgrade"
                      className="rounded-full border border-accent/50 px-3 py-1.5 text-xs text-accent hover:border-accent"
                    >
                      Resubscribe to resume
                    </Link>
                  )}
                  {state.isPro && (
                    <button
                      type="button"
                      onClick={() => {
                        setSaveError(null);
                        setEditing(alert);
                      }}
                      className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-muted hover:border-line-strong hover:text-ink"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === alert.id}
                    onClick={() => remove(alert)}
                    className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-faint hover:border-red-500/50 hover:text-red-500 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {alert.paused_reason === "subscription-ended" && (
                <p className="mt-3 rounded-md border border-line bg-panel-muted px-3 py-2 text-xs leading-relaxed text-ink-muted">
                  This stopped because your CongTrade Pro subscription ended. Nothing has been lost — the filter is
                  exactly as you left it, and resubscribing turns it straight back on.
                </p>
              )}

              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-xs text-ink-faint">
                <div className="flex gap-1.5">
                  <dt>Frequency</dt>
                  <dd className="text-ink-muted">{frequencyLabel(alert.frequency)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>Emails sent</dt>
                  <dd className="text-ink-muted">{alert.sent_count.toLocaleString()}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>Trades matched</dt>
                  <dd className="text-ink-muted">{alert.matched_count.toLocaleString()}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>Last email</dt>
                  <dd className="text-ink-muted">{alert.last_sent_at ? formatDateFromTimestamp(alert.last_sent_at) : "never"}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <AlertEditor
          existing={editing !== "new"}
          initial={
            editing === "new"
              ? // A handover from the trades page arrives with a suggested
                // name already written from its own criteria, so the whole
                // thing is one click from saved.
                draft && { name: summarizeAlert(draft).slice(0, 80), frequency: "instant" as const, filters: draft }
              : { name: editing.name, frequency: editing.frequency, filters: editing.filters }
          }
          saving={saving}
          error={saveError}
          onCancel={() => {
            setEditing(null);
            setDraft(undefined);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
