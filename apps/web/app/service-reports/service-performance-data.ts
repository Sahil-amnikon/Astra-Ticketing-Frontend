import type { Option } from '../workspace-tools';
export type ServiceRange = { from: string; to: string; clientId: string };
export type ServiceReport = {
  from: string;
  to: string;
  clientId: string | null;
  tickets: {
    created: number;
    resolved: number;
    open_now: number;
    average_resolution_hours: string | null;
  };
  sources: { source: string; count: number }[];
  changes: { status: string; count: number }[];
  knowledge: { article_links: number };
  clients: Option[];
};
export function initialRange(days = 30): ServiceRange {
  const end = new Date();
  return {
    from: new Date(end.getTime() - (days - 1) * 86400000)
      .toISOString()
      .slice(0, 10),
    to: end.toISOString().slice(0, 10),
    clientId: '',
  };
}
export function rangeMatches(a: ServiceRange, b: ServiceRange) {
  return a.from === b.from && a.to === b.to && a.clientId === b.clientId;
}
export function rangeValid(range: ServiceRange) {
  const start = Date.parse(range.from),
    end = Date.parse(range.to);
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    range.to >= range.from &&
    end - start <= 366 * 86400000
  );
}
export function periodBalance(report: ServiceReport) {
  const { created, resolved } = report.tickets;
  const delta = created - resolved;
  if (!created && !resolved)
    return 'No tickets were created or resolved in this period.';
  if (delta > 0)
    return `${delta.toLocaleString()} more tickets created than resolved.`;
  if (delta < 0)
    return `${Math.abs(delta).toLocaleString()} more tickets resolved than created.`;
  return 'Ticket intake and resolutions were balanced this period.';
}
export function displayLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b[a-z]/g, (character) => character.toUpperCase())
    .replace(/\bSms\b/g, 'SMS');
}
export function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}
export function serviceCsvRows(
  report: ServiceReport,
  generatedAt: string,
): unknown[][] {
  return [
    ['ASTRA Service performance'],
    ['Metric', 'Value'],
    ['From', report.from],
    ['To', report.to],
    [
      'Organization',
      report.clients.find((client) => client.id === report.clientId)?.name ??
        'All assigned organizations',
    ],
    ['Organization ID', report.clientId ?? 'ALL_ASSIGNED'],
    ['Generated at (UTC)', generatedAt],
    [
      'Period basis',
      'Created and resolved use their event dates (UTC). Open now is current backlog. Resolution hours include pauses.',
    ],
    ...Object.entries(report.tickets),
    ['Knowledge links', report.knowledge.article_links],
    ...report.sources.map((source) => [
      `Source: ${source.source}`,
      source.count,
    ]),
    ...report.changes.map((change) => [
      `Change status: ${change.status}`,
      change.count,
    ]),
  ];
}
