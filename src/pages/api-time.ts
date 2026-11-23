// MySQL event timestamps are stored in UTC. Older API responses omit the zone.
// Explicit zones remain authoritative; never add a fixed local-time offset.
export function parseApiTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  let text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?$/.test(text)) {
    text = text.replace(' ', 'T').replace(/(\.\d{3})\d+$/, '$1') + 'Z';
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatApiDate(value: unknown): string {
  return parseApiTimestamp(value)?.toLocaleString() ?? '—';
}
