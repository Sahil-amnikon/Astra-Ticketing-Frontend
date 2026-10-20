import {
  collectReport,
  breakdown,
  type ReportFilters,
  type ReportKind,
  type ReportRow,
} from './module-report-data';
import type { ApiRequest } from '../workspace-tools';

export const overviewModules: {
  kind: ReportKind;
  name: string;
  reference: string;
  title: string;
  owner: string;
  indicator: string;
}[] = [
  {
    kind: 'tickets',
    name: 'Tickets',
    reference: 'ticket_number',
    title: 'subject',
    owner: 'assigned_name',
    indicator: 'SLA at risk / breached',
  },
  {
    kind: 'changes',
    name: 'Change Management',
    reference: 'change_number',
    title: 'title',
    owner: 'owner_name',
    indicator: 'High / critical risk',
  },
  {
    kind: 'problems',
    name: 'Problem Management',
    reference: 'problem_number',
    title: 'title',
    owner: 'owner_name',
    indicator: 'Known errors',
  },
];
export type OverviewReport = {
  modules: Record<ReportKind, ReportRow[]>;
  filters: ReportFilters;
  clientName: string;
  generatedAt: string;
};
export const lifecycleLabels = [
  'Active',
  'Resolved / completed',
  'Cancelled / rejected',
  'Failed / rolled back',
];
export function lifecycle(row: ReportRow, kind: ReportKind): string {
  const status = String(row.status);
  if (
    (kind === 'changes'
      ? ['COMPLETED', 'CLOSED']
      : ['RESOLVED', 'CLOSED']
    ).includes(status)
  )
    return lifecycleLabels[1];
  if (
    (kind === 'tickets'
      ? ['CANCELLED']
      : kind === 'changes'
        ? ['CANCELLED', 'REJECTED']
        : []
    ).includes(status)
  )
    return lifecycleLabels[2];
  if (kind === 'changes' && ['FAILED', 'ROLLED_BACK'].includes(status))
    return lifecycleLabels[3];
  return lifecycleLabels[0];
}
export function moduleNumbers(rows: ReportRow[], kind: ReportKind) {
  const counts = lifecycleLabels.map(
    (name) => rows.filter((row) => lifecycle(row, kind) === name).length,
  );
  const attention = rows.filter((row) =>
    kind === 'tickets'
      ? ['AT_RISK', 'BREACHED'].includes(String(row.sla_status))
      : kind === 'changes'
        ? ['HIGH', 'CRITICAL'].includes(String(row.risk))
        : row.status === 'KNOWN_ERROR',
  ).length;
  return {
    total: rows.length,
    active: counts[0],
    completed: counts[1],
    cancelled: counts[2],
    failed: counts[3],
    attention,
  };
}
export function overviewNumbers(report: OverviewReport) {
  return overviewModules.map((module) => ({
    ...module,
    ...moduleNumbers(report.modules[module.kind], module.kind),
  }));
}
export function overviewLifecycle(report: OverviewReport): [string, number][] {
  return lifecycleLabels.map((name) => [
    name,
    overviewModules.reduce(
      (sum, module) =>
        sum +
        report.modules[module.kind].filter(
          (row) => lifecycle(row, module.kind) === name,
        ).length,
      0,
    ),
  ]);
}
export async function collectOverview(
  request: ApiRequest,
  filters: ReportFilters,
  signal: AbortSignal,
): Promise<Record<ReportKind, ReportRow[]>> {
  try {
    const rows = await Promise.all(
      overviewModules.map(async (module) => {
        try {
          return await collectReport(request, module.kind, filters, signal);
        } catch (reason) {
          throw new Error(`${module.name}: ${(reason as Error).message}`);
        }
      }),
    );
    return { tickets: rows[0], changes: rows[1], problems: rows[2] };
  } catch (reason) {
    throw new Error(
      `The complete overview could not be generated. ${(reason as Error).message}`,
    );
  }
}
export function overviewMetadata(report: OverviewReport): unknown[][] {
  return [
    ['ASTRA holistic overview report'],
    [
      'Period basis',
      'Created date (UTC); status, owner, SLA and risk are current values',
    ],
    ['From', report.filters.from],
    ['Through', report.filters.to],
    ['Client', report.clientName],
    ['Client ID', report.filters.clientId || 'ALL_ACCESSIBLE'],
    ['Search', report.filters.q],
    ['Generated at (UTC)', report.generatedAt],
    [
      'Counting basis',
      'Each ticket, change and problem counts once in its own module, including linked records.',
    ],
  ];
}
export function overviewSummaryCsv(report: OverviewReport): unknown[][] {
  const numbers = overviewNumbers(report);
  return [
    ...overviewMetadata(report),
    [],
    [
      'Module',
      'Total',
      ...lifecycleLabels,
      'Attention indicator',
      'Attention count',
    ],
    ...numbers.map((n) => [
      n.name,
      n.total,
      n.active,
      n.completed,
      n.cancelled,
      n.failed,
      n.indicator,
      n.attention,
    ]),
    [
      'Overall',
      ...(['total', 'active', 'completed', 'cancelled', 'failed'] as const).map(
        (key) => numbers.reduce((sum, n) => sum + n[key], 0),
      ),
      'Module-specific indicators above',
      '',
    ],
    [],
    ['Module', 'Breakdown', 'Value', 'Count'],
    ...overviewModules.flatMap((module) =>
      [
        'status',
        module.kind === 'tickets'
          ? 'sla_status'
          : module.kind === 'changes'
            ? 'risk'
            : 'priority',
      ].flatMap((key) =>
        breakdown(report.modules[module.kind], key).map(([name, count]) => [
          module.name,
          key,
          name,
          count,
        ]),
      ),
    ),
  ];
}
export function overviewRecords(report: OverviewReport): unknown[][] {
  return [
    [
      'Module',
      'Record ID',
      'Reference',
      'Title',
      'Client',
      'Client ID',
      'Status',
      'Lifecycle',
      'Owner',
      'Owner ID',
      'Priority',
      'SLA status',
      'Risk',
      'Created (UTC)',
      'Updated (UTC)',
    ],
    ...overviewModules.flatMap((module) =>
      report.modules[module.kind].map((row) => [
        module.name,
        row.id,
        row[module.reference],
        row[module.title],
        row.client_name,
        row.client_id,
        row.status,
        lifecycle(row, module.kind),
        row[module.owner],
        row[module.kind === 'tickets' ? 'assigned_user_id' : 'owner_user_id'],
        row.priority,
        module.kind === 'tickets' ? row.sla_status : '',
        module.kind === 'changes' ? row.risk : '',
        row.created_at,
        row.updated_at,
      ]),
    ),
  ];
}
