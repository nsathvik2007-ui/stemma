/* Deadlines are stored UTC and rendered in Asia/Kolkata (settings.TIME_ZONE).
   The backend already serialises with a +05:30 offset, so `new Date(iso)` is
   correct here — these helpers only decide the wording. */

export function shortDate(iso: string | null): string {
  if (!iso) return 'No deadline';
  const d = new Date(iso);
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).slice(0, 3);
  return `${d.getDate()} ${month}`;
}

export function dateAndTime(iso: string | null): string {
  if (!iso) return 'No deadline set';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} · ${time}`;
}

/* "Closes in 3 days" / "Closed 2 days ago". Whole days only: an hour-level
   countdown implies a precision the deadline itself does not have. */
export function relativeDeadline(iso: string | null): string {
  if (!iso) return 'No deadline';
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / 86_400_000);
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  if (days > 1) return `Closes in ${days} days`;
  if (days === -1) return 'Closed yesterday';
  return `Closed ${Math.abs(days)} days ago`;
}

/* datetime-local gives a naive "2026-09-12T17:00". The backend reads a naive
   string as UTC, which would silently shift an IST deadline by 5h30m, so the
   offset is appended explicitly. */
export function toIstIso(localValue: string): string {
  return `${localValue}:00+05:30`;
}

/* And back, for populating the input from a stored value. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
