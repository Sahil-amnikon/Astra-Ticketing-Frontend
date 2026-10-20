import type { ApiRequest } from '../workspace-tools';
export type ReportKind = 'tickets' | 'changes' | 'problems';
export type ReportRow = Record<string, unknown>;
export type ReportFilters = {
  from: string;
  to: string;
  clientId: string;
  status: string;
  q: string;
  ownerIds?: string[];
};
export const UNASSIGNED_OWNER = 'UNASSIGNED';
export function reportOwnerId(row: ReportRow, kind: ReportKind) {
  const id = row[kind === 'tickets' ? 'assigned_user_id' : 'owner_user_id'];
  return id == null ? UNASSIGNED_OWNER : String(id);
}
export function reportOwners(rows: ReportRow[], kind: ReportKind) {
  const owners = new Map<string, { id: string; name: string; count: number }>();
  for (const row of rows) {
    const id = reportOwnerId(row, kind);
    const name =
      id === UNASSIGNED_OWNER
        ? 'Unassigned'
        : String(
            row[kind === 'tickets' ? 'assigned_name' : 'owner_name'] ?? id,
          );
    const owner = owners.get(id);
    owners.set(id, { id, name, count: (owner?.count ?? 0) + 1 });
  }
  return [...owners.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}
export function sameReportFilters(a: ReportFilters, b: ReportFilters) {
  return (
    ['from', 'to', 'clientId', 'status', 'q'].every(
      (key) => a[key as keyof ReportFilters] === b[key as keyof ReportFilters],
    ) &&
    JSON.stringify([...(a.ownerIds ?? [])].sort()) ===
      JSON.stringify([...(b.ownerIds ?? [])].sort())
  );
}
export function ownerBreakdown(
  rows: ReportRow[],
  kind: ReportKind,
): [string, number][] {
  const owners = reportOwners(rows, kind);
  return owners
    .map(
      (owner) =>
        [
          owners.filter((other) => other.name === owner.name).length > 1
            ? `${owner.name} · ${owner.id}`
            : owner.name,
          owner.count,
        ] as [string, number],
    )
    .sort((a, b) => b[1] - a[1]);
}
export async function collectReport(
  request: ApiRequest,
  kind: ReportKind,
  filters: ReportFilters,
  signal: AbortSignal,
) {
  if (
    !Number.isFinite(Date.parse(filters.from)) ||
    !Number.isFinite(Date.parse(filters.to)) ||
    filters.to < filters.from ||
    new Date(filters.to).getTime() - new Date(filters.from).getTime() >
      366 * 86400000
  )
    throw new Error('Choose a valid date range of no more than one year.');
  const query = new URLSearchParams({ pageSize: '100', q: filters.q });
  if (filters.clientId) query.set('clientId', filters.clientId);
  if (filters.status) query.set('status', filters.status);
  if (kind === 'tickets') {
    query.set('scope', 'all');
    query.set('from', filters.from);
    query.set('to', filters.to);
  }
  const rows: ReportRow[] = [];
  let total: number | undefined;
  const ids = new Set<string>();
  for (let page = 1; ; page++) {
    query.set('page', String(page));
    const result = await request<{ items: ReportRow[]; total: number }>(
      `/${kind}?${query}`,
      { signal },
    );
    if (
      !Number.isInteger(result.total) ||
      result.total < 0 ||
      !Array.isArray(result.items)
    )
      throw new Error('The report response is invalid. Please retry.');
    if (total === undefined) total = result.total;
    if (total !== result.total)
      throw new Error(
        'Records changed during report generation. Generate the report again.',
      );
    if (total > 5000)
      throw new Error(
        'This selection exceeds 5,000 records. Narrow the client, status or search filters before generating a complete report.',
      );
    for (const row of result.items) {
      const id = String(row.id ?? '');
      if (!id || ids.has(id))
        throw new Error(
          'Records moved between pages during generation. Generate the report again.',
        );
      ids.add(id);
      rows.push(row);
    }
    if (rows.length >= total) break;
    if (!result.items.length || page >= 50)
      throw new Error(
        'The complete report could not be collected. Please retry.',
      );
  }
  if (rows.length !== total)
    throw new Error('The report count changed. Generate the report again.');
  const start = Date.parse(`${filters.from}T00:00:00Z`),
    end = Date.parse(`${filters.to}T00:00:00Z`) + 86400000;
  return rows.filter((row) => {
    const created = Date.parse(String(row.created_at));
    return (
      created >= start &&
      created < end &&
      (!filters.ownerIds?.length ||
        filters.ownerIds.includes(reportOwnerId(row, kind)))
    );
  });
}
export function breakdown(rows: ReportRow[], key: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = String(row[key] ?? 'Unassigned');
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}
export function reportCsv(rows: unknown[][]) {
  return (
    '\ufeff' +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? '');
            if (/^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(','),
      )
      .join('\r\n')
  );
}
export function downloadReport(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(
    new Blob([reportCsv(rows)], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
