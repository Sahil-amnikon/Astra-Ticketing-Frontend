'use client';
import { useEffect, useState } from 'react';
import ReportBreakdownChart from './report-breakdown-chart';
import ReportOwnerFilter from './report-owner-filter';
import { WorkspaceFrame, useWorkspace, type Option } from '../workspace-tools';
import {
  breakdown,
  reportOwners,
  ownerBreakdown,
  sameReportFilters,
  collectReport,
  downloadReport,
  type ReportFilters,
  type ReportKind,
  type ReportRow,
} from './module-report-data';

const config = {
  tickets: {
    title: 'Ticket reports',
    identifier: 'ticket_number',
    titleKey: 'subject',
    owner: 'assigned_name',
    extra: 'sla_status',
    extraLabel: 'SLA status',
    statuses: [
      'NEW',
      'OPEN',
      'IN_PROGRESS',
      'WAITING_FOR_CLIENT',
      'WAITING_FOR_VENDOR',
      'ON_HOLD',
      'RESOLVED',
      'CLOSED',
      'CANCELLED',
    ],
  },
  changes: {
    title: 'Change management reports',
    identifier: 'change_number',
    titleKey: 'title',
    owner: 'owner_name',
    extra: 'risk',
    extraLabel: 'Risk',
    statuses: [
      'DRAFT',
      'SUBMITTED',
      'ASSESSMENT',
      'AWAITING_APPROVAL',
      'APPROVED',
      'SCHEDULED',
      'IN_PROGRESS',
      'VALIDATION',
      'COMPLETED',
      'CLOSED',
      'REJECTED',
      'CANCELLED',
      'FAILED',
      'ROLLED_BACK',
    ],
  },
  problems: {
    title: 'Problem management reports',
    identifier: 'problem_number',
    titleKey: 'title',
    owner: 'owner_name',
    extra: 'priority',
    extraLabel: 'Priority',
    statuses: ['OPEN', 'INVESTIGATING', 'KNOWN_ERROR', 'RESOLVED', 'CLOSED'],
  },
};
const label = (value: unknown) => String(value ?? '—').replaceAll('_', ' ');
const text = (row: ReportRow, key: string) => String(row[key] ?? '—');
function initialFilters(): ReportFilters {
  const now = new Date();
  return {
    from: new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    clientId: '',
    status: '',
    q: '',
    ownerIds: [],
  };
}
type Generated = {
  rows: ReportRow[];
  filters: ReportFilters;
  generatedAt: string;
  clientName: string;
  ownerNames: string[];
};
export default function ModuleReports({ kind }: { kind: ReportKind }) {
  const w = useWorkspace();
  const { session, request } = w;
  const c = config[kind];
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  const [clients, setClients] = useState<Option[]>([]);
  const [knownOwners, setKnownOwners] = useState<
    { id: string; name: string; count: number }[]
  >([]);
  const [report, setReport] = useState<Generated>();
  const [selected, setSelected] = useState<ReportRow>();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [optionsError, setOptionsError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const allowed =
    session?.user.workspace === 'management' &&
    Boolean(
      session.user.permissions?.includes('REPORTS_VIEW') ||
      session.user.roles.includes('ADMIN'),
    );
  const [controller, setController] = useState<AbortController>();
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const abort = new AbortController();
    void request<{ clients: Option[] }>(`/${kind}/options`, {
      signal: abort.signal,
    })
      .then((result) => {
        if (live) setClients(result.clients);
      })
      .catch((e) => {
        if (live && e.name !== 'AbortError') setOptionsError(e.message);
      });
    return () => {
      live = false;
      abort.abort();
    };
  }, [kind, allowed, request]);
  useEffect(() => () => controller?.abort(), [controller]);
  const dirty = !report || !sameReportFilters(filters, report.filters);
  async function generate() {
    if (!allowed || busy) return;
    const abort = new AbortController();
    setController(abort);
    setBusy(true);
    setError('');
    setSelected(undefined);
    const applied = { ...filters, ownerIds: [...(filters.ownerIds ?? [])] };
    try {
      const rows = await collectReport(request, kind, applied, abort.signal);
      if (!abort.signal.aborted) {
        setReport({
          rows,
          filters: applied,
          ownerNames: (applied.ownerIds ?? []).map(
            (id) =>
              knownOwners.find((owner) => owner.id === id)?.name ??
              reportOwners(rows, kind).find((owner) => owner.id === id)?.name ??
              id,
          ),
          generatedAt: new Date().toISOString(),
          clientName:
            clients.find((client) => client.id === applied.clientId)?.name ??
            'All accessible clients',
        });
        setPage(1);
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setReport(undefined);
        setError((e as Error).message);
      }
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  const disabled = !report || dirty || busy || Boolean(error);
  const rows = report?.rows ?? [];
  const closed = rows.filter((row) =>
    [
      'RESOLVED',
      'CLOSED',
      'COMPLETED',
      'CANCELLED',
      'REJECTED',
      'ROLLED_BACK',
      'FAILED',
    ].includes(String(row.status)),
  ).length;
  const attention = rows.filter((row) =>
    kind === 'tickets'
      ? ['AT_RISK', 'BREACHED'].includes(String(row.sla_status))
      : kind === 'changes'
        ? ['HIGH', 'CRITICAL'].includes(String(row.risk))
        : row.status === 'KNOWN_ERROR',
  ).length;
  function exportCsv(summary: boolean) {
    if (disabled || !report) return;
    const metadata: unknown[][] = [
      [`ASTRA ${c.title}`],
      ['Period basis', 'Created date (UTC); other fields are current values'],
      ['From', report.filters.from],
      ['Through', report.filters.to],
      ['Client', report.clientName],
      ['Client ID', report.filters.clientId || 'ALL_ACCESSIBLE'],
      ['Status filter', report.filters.status || 'ALL'],
      ['Search', report.filters.q],
      ['Selected owners', report.ownerNames.join('; ') || 'ALL_OWNERS'],
      [
        'Selected owner IDs',
        report.filters.ownerIds?.join('; ') || 'ALL_OWNERS',
      ],
      ['Generated at (UTC)', report.generatedAt],
      ['Total matching records', rows.length],
    ];
    const columns = [
      c.identifier,
      c.titleKey,
      'client_name',
      'status',
      c.owner,
      kind === 'tickets' ? 'assigned_user_id' : 'owner_user_id',
      'priority',
      c.extra,
      'created_at',
      'updated_at',
    ];
    const unique = [...new Set(columns)];
    downloadReport(
      `astra-${kind}-${summary ? 'summary' : 'records'}-${report.filters.from}-${report.filters.to}.csv`,
      [
        ...metadata,
        [],
        ...(summary
          ? [
              ['Breakdown', 'Value', 'Count'],
              ...['status', c.owner, c.extra].flatMap((key) =>
                (key === c.owner
                  ? ownerBreakdown(rows, kind)
                  : breakdown(rows, key)
                ).map(([name, count]) => [key, name, count]),
              ),
            ]
          : [
              unique.map(label),
              ...rows.map((row) => unique.map((key) => row[key])),
            ]),
      ],
    );
  }
  async function exportExcel() {
    if (disabled || exporting || !report) return;
    setExporting(true);
    setExportError('');
    try {
      const { downloadReportExcel } = await import('./report-excel');
      downloadReportExcel({ ...report, kind, ...c });
    } catch (e) {
      setExportError(
        (e as Error).message || 'Excel export failed. Please retry.',
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <WorkspaceFrame
      title={c.title}
      description="Management reporting, read-only record review and downloads."
      user={session?.user}
      csrfToken={session?.csrfToken}
      error={w.error}
    >
      {!session ? (
        <p role="status">Loading management access…</p>
      ) : !allowed ? (
        <section className="panel" role="alert">
          Select the Management workspace with report access to use this page.
        </section>
      ) : (
        <div className="management-reporting">
          <section className="panel management-report-builder">
            <div className="section-heading">
              <div>
                <h2>Generate report</h2>
                <p className="hint">
                  Filter records, review the results and download a complete
                  report.
                </p>
              </div>
              <span className="corporate-pill">Management · Read only</span>
            </div>
            <form
              className="management-report-fields"
              onSubmit={(e) => {
                e.preventDefault();
                void generate();
              }}
            >
              <label>
                Created from (UTC)
                <input
                  type="date"
                  required
                  disabled={busy}
                  value={filters.from}
                  max={filters.to}
                  onChange={(e) =>
                    setFilters({ ...filters, from: e.target.value })
                  }
                />
              </label>
              <label>
                Created through (UTC)
                <input
                  type="date"
                  required
                  disabled={busy}
                  value={filters.to}
                  min={filters.from}
                  onChange={(e) =>
                    setFilters({ ...filters, to: e.target.value })
                  }
                />
              </label>
              <label>
                Client
                <select
                  disabled={busy}
                  value={filters.clientId}
                  onChange={(e) =>
                    setFilters({ ...filters, clientId: e.target.value })
                  }
                >
                  <option value="">All accessible clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  disabled={busy}
                  value={filters.status}
                  onChange={(e) =>
                    setFilters({ ...filters, status: e.target.value })
                  }
                >
                  <option value="">All statuses</option>
                  {c.statuses.map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Search
                <input
                  maxLength={200}
                  disabled={busy}
                  value={filters.q}
                  onChange={(e) =>
                    setFilters({ ...filters, q: e.target.value })
                  }
                  placeholder="Reference or title"
                />
              </label>
              <ReportOwnerFilter
                kind={kind}
                filters={filters}
                request={request}
                onOwnersLoaded={setKnownOwners}
                disabled={busy}
                onChange={(ownerIds) => setFilters({ ...filters, ownerIds })}
              />
              <button className="primary" disabled={busy}>
                {busy ? 'Generating…' : 'Generate report'}
              </button>
            </form>
            {optionsError ? (
              <p className="notice error" role="alert">
                Client options could not load: {optionsError} Refresh to retry.
              </p>
            ) : null}
            {error ? (
              <p className="notice error" role="alert">
                {error}
              </p>
            ) : null}
            <p className="hint">
              Reports include records created in the selected UTC period.
              Status, owner, SLA and risk show current values. Generation
              supports up to 5,000 accessible records per selection; larger
              selections require narrower filters and are never partially
              exported.
            </p>
            <div className="management-presets">
              <button
                type="button"
                className="primary"
                disabled={disabled || exporting}
                onClick={() => void exportExcel()}
              >
                {exporting ? 'Preparing Excel…' : 'Download Excel'}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={() => exportCsv(true)}
              >
                Download summary CSV
              </button>
              <button
                type="button"
                className="primary"
                disabled={disabled}
                onClick={() => exportCsv(false)}
              >
                Download records CSV
              </button>
            </div>
            <p className="hint">
              Excel includes a graphical Summary worksheet and the complete
              filtered Records worksheet.
            </p>
            {exportError ? (
              <p className="notice error" role="alert">
                {exportError}
              </p>
            ) : null}
            {report && dirty ? (
              <p role="status" className="hint">
                Filters changed. Generate again to update the report and enable
                downloads.
              </p>
            ) : null}
          </section>
          {report ? (
            <>
              <div className="corporate-section-label">
                <h2>Report results</h2>
                <span>
                  {report.clientName} · {report.filters.from} –{' '}
                  {report.filters.to} (UTC)
                </span>
              </div>
              <div className="management-summary-grid">
                <article className="panel">
                  <small>Matching records</small>
                  <strong>{rows.length.toLocaleString()}</strong>
                </article>
                <article className="panel">
                  <small>Currently active</small>
                  <strong>{(rows.length - closed).toLocaleString()}</strong>
                </article>
                <article className="panel">
                  <small>Currently finished / terminal</small>
                  <strong>{closed.toLocaleString()}</strong>
                </article>
                <article className="panel">
                  <small>
                    {kind === 'tickets'
                      ? 'SLA at risk / breached'
                      : kind === 'changes'
                        ? 'High / critical risk'
                        : 'Known errors'}
                  </small>
                  <strong>{attention.toLocaleString()}</strong>
                </article>
              </div>
              <div className="management-chart-grid">
                {[
                  ['status', 'Status breakdown'],
                  [
                    c.owner,
                    kind === 'tickets' ? 'Assigned technician' : 'Record owner',
                  ],
                ].map(([key, title]) => (
                  <ReportBreakdownChart
                    key={key}
                    title={title}
                    rows={
                      key === c.owner
                        ? ownerBreakdown(rows, kind)
                        : breakdown(rows, key)
                    }
                    variant={key === 'status' ? 'donut' : 'bars'}
                  />
                ))}
              </div>
              <section className="panel">
                <div className="section-heading">
                  <h2>Record report</h2>
                  <span>
                    {rows.length} records · click a reference to review
                  </span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          'Reference',
                          'Title',
                          'Client',
                          'Status',
                          kind === 'tickets' ? 'Assignee' : 'Owner',
                          c.extraLabel,
                          'Created (UTC)',
                        ].map((name) => (
                          <th key={name}>{name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice((page - 1) * 25, page * 25).map((row) => (
                        <tr key={text(row, 'id')}>
                          <td>
                            <button
                              type="button"
                              className="management-record-link"
                              onClick={() => setSelected(row)}
                            >
                              {text(row, c.identifier)}
                            </button>
                          </td>
                          <td>{text(row, c.titleKey)}</td>
                          <td>{text(row, 'client_name')}</td>
                          <td>{label(row.status)}</td>
                          <td>{text(row, c.owner)}</td>
                          <td>{label(row[c.extra])}</td>
                          <td>{String(row.created_at).slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!rows.length ? (
                  <p className="empty">No matching records in this period.</p>
                ) : null}
                <div className="management-presets">
                  <button
                    type="button"
                    className="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page} of {Math.max(1, Math.ceil(rows.length / 25))}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={page * 25 >= rows.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </section>
            </>
          ) : !busy && !error ? (
            <section className="panel">
              <h2>Your report is ready to generate</h2>
              <p>
                Choose filters above and select Generate report. This page
                provides reporting and read-only review.
              </p>
            </section>
          ) : null}
          {selected ? (
            <section
              className="panel management-record-preview"
              aria-label="Read-only record preview"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">READ-ONLY RECORD PREVIEW</p>
                  <h2>
                    {text(selected, c.identifier)} ·{' '}
                    {text(selected, c.titleKey)}
                  </h2>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSelected(undefined)}
                >
                  Close preview
                </button>
              </div>
              <p>{text(selected, 'description')}</p>
              <dl>
                {[
                  'client_name',
                  'status',
                  c.owner,
                  c.extra,
                  'priority',
                  'created_at',
                  'updated_at',
                ]
                  .filter((key, index, keys) => keys.indexOf(key) === index)
                  .map((key) => (
                    <div key={key}>
                      <dt>{label(key)}</dt>
                      <dd>{label(selected[key])}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          ) : null}
        </div>
      )}
    </WorkspaceFrame>
  );
}
