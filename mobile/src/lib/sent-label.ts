/** "Today at 13:59", "Yesterday at 16:50", "Nov 15 at 16:50": when a notification went out. */
export function sentLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((today - day) / 86_400_000);
  if (days === 0) return `Today at ${time}`;
  if (days === 1) return `Yesterday at ${time}`;
  const date = d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `${date} at ${time}`;
}
