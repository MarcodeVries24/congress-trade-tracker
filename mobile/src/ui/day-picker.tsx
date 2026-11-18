import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { createElement } from 'react';
import { Platform } from 'react-native';

import { radius, useTheme } from '@/theme';

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-03-05" as that calendar day on this phone, at the given hour. */
export function isoToLocal(iso: string, hour = 12): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hour);
}

/** The calendar day a picked date falls on here, as the route's YYYY-MM-DD. */
export function localToIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return localToIso(new Date());
}

/**
 * One calendar day, picked the way the platform picks one: Material's date
 * dialog on Android, the inline calendar on iOS, the browser's date field in
 * the web preview. Days are passed as YYYY-MM-DD, the form the trades route
 * compares against, so no time zone can move a pick to the day before.
 *
 * On a phone a picked day is the end of it: Android's dialog closes itself,
 * and the iOS calendar is closed through `onClose`, which also hears of
 * Android's Cancel. The web's field stays until the caller removes it, as
 * typing a date into it reports every keystroke.
 */
export function DayPicker({
  value,
  min,
  max,
  onPick,
  onClose,
}: {
  value: string | undefined;
  min: string;
  max: string;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const { scheme, c } = useTheme();

  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date',
      value: value ?? '',
      min,
      max,
      autoFocus: true,
      onChange: (e: { target: { value: string } }) => {
        if (e.target.value) onPick(e.target.value);
      },
      style: {
        borderRadius: radius.lg,
        border: `1px solid ${c.border}`,
        background: c.surface,
        color: c.text,
        padding: '12px 16px',
        fontSize: 16,
        colorScheme: scheme,
      },
    });
  }

  return (
    <DateTimePicker
      value={isoToLocal(value ?? max)}
      mode="date"
      display={Platform.OS === 'ios' ? 'inline' : 'default'}
      minimumDate={isoToLocal(min, 0)}
      maximumDate={isoToLocal(max, 23)}
      accentColor={c.accent}
      themeVariant={scheme}
      onChange={(event, date) => {
        if (event.type === 'set' && date) onPick(localToIso(date));
        onClose();
      }}
    />
  );
}
