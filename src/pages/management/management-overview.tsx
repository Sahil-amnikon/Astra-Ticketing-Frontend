'use client';

import Link from '../../navigation/link';
import { uiLabel } from '../ui-label';
import ReportBreakdownChart from './report-breakdown-chart';
import { useEffect, useState } from 'react';
import type { ApiRequest, Option } from '../workspace-tools';

type Row = Record<string, unknown>;
type Range = { from: string; to: string; clientId: string };
type ServiceReport = {
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
const number = (value: unknown) => Number(value ?? 0).toLocaleString();
const label = uiLabel;
function date(value: Date) {
  return value.toISOString().slice(0, 10);
}
function initialRange(): Range {
  const end = new Date();
  return {
    from: date(new Date(end.getTime() - 29 * 86400000)),
    to: date(end),
    clientId: '',
  };
}
function downloadCsv(name: string, rows: unknown[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          let text = String(value ?? '');
          if (/^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
          return `"${text.replaceAll('"', '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
  const url = URL.createObjectURL(
    new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ManagementOverview({
  snapshot,
  request,
  canReport,
}: {
  snapshot: Row;
  request: ApiRequest;
  canReport: boolean;
}) {
  const [draft, setDraft] = useState<Range>(initialRange);
  const [applied, setApplied] = useState<Range>(initialRange);
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<ServiceReport>();
  const [loading, setLoading] = useState(canReport);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState('');
  const counts = (snapshot.counts ?? {}) as Row;
  const charts = (snapshot.charts ?? {}) as Row;
  const dirty = Object.keys(draft).some(
    (key) => draft[key as keyof Range] !== applied[key as keyof Range],
  );
  useEffect(() => {
    if (!canReport) return;
    let live = true;
    const controller = new AbortController();
    const query = new URLSearchParams({ from: applied.from, to: applied.to });
    if (applied.clientId) query.set('clientId', applied.clientId);
    void request<ServiceReport>(`/service-reports?${query}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (live) {
          setReport(result);
          setGenerated(new Date().toISOString());
        }
      })
      .catch((e) => {
        if (live && e.name !== 'AbortError') {
          setReport(undefined);
          setError(e.message);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [applied, request, canReport, revision]);
  const clientName =
    report?.clients.find((client) => client.id === report.clientId)?.name ??
    'All accessible clients';
  function exportReport() {
    if (!report || loading || dirty || error) return;
    downloadCsv(`astra-service-performance-${report.from}-${report.to}.csv`, [
      ['ASTRA service performance report'],
      ['From (UTC)', report.from],
      ['Through (UTC)', report.to],
      ['Client', clientName],
      ['Client ID', report.clientId ?? 'ALL_ACCESSIBLE'],
      ['Generated at (UTC)', generated],
      ['Metric', 'Value'],
      ['Tickets created', report.tickets.created],
      ['Tickets resolved', report.tickets.resolved],
      ['Current open backlog', report.tickets.open_now],
      [
        'Average elapsed resolution hours',
        report.tickets.average_resolution_hours ?? '',
      ],
      ['Articles linked to tickets', report.knowledge.article_links],
      ...report.sources.map((row) => [
        `Request source: ${row.source}`,
        row.count,
      ]),
      ...report.changes.map((row) => [
        `Current change status: ${row.status}`,
        row.count,
      ]),
      [
        'Definitions',
        'Created and resolved use their event dates. Open backlog is current. Resolution includes pauses. Change status is current for changes created in the period.',
      ],
    ]);
  }
  function exportSnapshot() {
    downloadCsv(`astra-current-service-snapshot-${date(new Date())}.csv`, [
      ['ASTRA current service snapshot'],
      [
        'Scope',
        'All accessible tickets; independent of report date/client filters',
      ],
      ['Downloaded at (UTC)', new Date().toISOString()],
      ['Metric', 'Value'],
      ...[
        'open',
        'new',
        'in_progress',
        'waiting',
        'pending_approval',
        'sla_at_risk',
        'sla_breached',
        'unattended',
      ].map((key) => [key, counts[key] ?? 0]),
      ...['status', 'priority', 'workload'].flatMap((key) =>
        ((charts[key] ?? []) as Row[]).map((row) => [
          key,
          row.label ?? row.name,
          row.value ?? row.open ?? 0,
        ]),
      ),
    ]);
  }
  function preset(days: number | 'month') {
    const end = new Date();
    const start =
      days === 'month'
        ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
        : new Date(end.getTime() - (days - 1) * 86400000);
    setDraft({ ...draft, from: date(start), to: date(end) });
  }
  return (
    <div className="management-reporting">
      <header className="corporate-heading">
        <div>
          <p className="eyebrow">MANAGEMENT / REPORTING & ANALYTICS</p>
          <h1>Management overview</h1>
          <p>
            Measure service performance, review your team and download reports.
          </p>
        </div>
        <Link className="primary" href="/management/reports">
          Technician reports & downloads →
        </Link>
      </header>
      {!canReport ? (
        <section className="panel" role="alert">
          Report access is required to generate service performance reports.
          Your current service snapshot is shown below.
        </section>
      ) : (
        <>
          <section className="panel management-report-builder">
            <div className="section-heading">
              <div>
                <h2>Generate a service report</h2>
                <p className="hint">
                  Choose the reporting period and client. Downloads use the
                  generated report.
                </p>
              </div>
              <span className="corporate-pill">Client-scoped reporting</span>
            </div>
            <div className="management-presets">
              <button
                type="button"
                className="secondary"
                onClick={() => preset(7)}
              >
                Last 7 days
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => preset('month')}
              >
                This month
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => preset(30)}
              >
                Last 30 days
              </button>
            </div>
            <form
              className="management-report-fields"
              onSubmit={(e) => {
                e.preventDefault();
                setLoading(true);
                setError('');
                setApplied({ ...draft });
                setRevision((value) => value + 1);
              }}
            >
              <label>
                From (UTC)
                <input
                  type="date"
                  required
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                />
              </label>
              <label>
                Through (UTC)
                <input
                  type="date"
                  required
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                />
              </label>
              <label>
                Client
                <select
                  value={draft.clientId}
                  onChange={(e) =>
                    setDraft({ ...draft, clientId: e.target.value })
                  }
                >
                  <option value="">All accessible clients</option>
                  {report?.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary" disabled={loading}>
                {loading ? 'Generating…' : 'Generate report'}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!report || loading || dirty || Boolean(error)}
                onClick={exportReport}
              >
                Download CSV
              </button>
            </form>
            {dirty ? (
              <p className="hint" role="status">
                Filters have changed. Generate the report to update the results
                and enable its download.
              </p>
            ) : null}
            {error ? (
              <div className="notice error" role="alert">
                {error}{' '}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setLoading(true);
                    setError('');
                    setRevision((value) => value + 1);
                  }}
                >
                  Retry report
                </button>
              </div>
            ) : null}
          </section>
          {report ? (
            <section aria-busy={loading} className="management-report-results">
              <div className="corporate-section-label">
                <h2>Service performance</h2>
                <span>
                  {clientName} · {report.from} – {report.to} (UTC)
                  {loading ? ' · Updating…' : ''}
                </span>
              </div>
              <div className="management-summary-grid">
                {[
                  ['Tickets created', report.tickets.created],
                  ['Tickets resolved', report.tickets.resolved],
                  ['Current open backlog', report.tickets.open_now],
                  [
                    'Avg. resolution hours',
                    report.tickets.average_resolution_hours ?? '—',
                  ],
                  ['Knowledge articles linked', report.knowledge.article_links],
                ].map(([title, value]) => (
                  <article className="panel" key={title}>
                    <small>{title}</small>
                    <strong>
                      {typeof value === 'number' ? number(value) : value}
                    </strong>
                  </article>
                ))}
              </div>
              <div className="management-chart-grid">
                <ReportBreakdownChart
                  title="Request sources"
                  variant="donut"
                  rows={report.sources.map((row) => [
                    label(row.source),
                    row.count,
                  ])}
                />
                <ReportBreakdownChart
                  title="Change outcomes · current status"
                  variant="stacked"
                  rows={report.changes.map((row) => [
                    label(row.status),
                    row.count,
                  ])}
                />
              </div>
              <p className="hint management-definition">
                Created and resolved use their respective event dates in the
                selected UTC period. Open backlog is current. Resolution hours
                include pauses. Change results show current status of changes
                created in the period; unavailable change access returns no
                rows.
              </p>
            </section>
          ) : loading ? (
            <p className="notice" role="status">
              Generating your service report…
            </p>
          ) : null}
        </>
      )}
      <section className="panel management-download-centre">
        <div>
          <p className="eyebrow">REPORT LIBRARY</p>
          <h2>Team activity & SLA reports</h2>
          <p>
            Review assignments, transfers, work completed and SLA outcomes.
            Filter by dates and technician, then download CSV or Excel.
          </p>
          <small>
            Technician reports use their own filters and your existing access
            scope.
          </small>
        </div>
        <Link className="primary" href="/management/reports">
          Open report library →
        </Link>
      </section>
      <div className="corporate-section-label">
        <div>
          <h2>Current service snapshot</h2>
          <p className="hint">
            All accessible tickets · independent of the report date and client
            filters above
          </p>
        </div>
        <button type="button" className="secondary" onClick={exportSnapshot}>
          Download snapshot CSV
        </button>
      </div>
      <div className="management-summary-grid management-snapshot-grid">
        {[
          ['Open tickets', counts.open],
          ['In progress', counts.in_progress],
          ['Waiting', counts.waiting],
          ['SLA at risk', counts.sla_at_risk],
          ['SLA breached', counts.sla_breached],
        ].map(([title, value]) => (
          <article className="panel" key={String(title)}>
            <small>{String(title)}</small>
            <strong>{number(value)}</strong>
          </article>
        ))}
      </div>
      <div className="management-chart-grid">
        <ReportBreakdownChart
          title="Current ticket status"
          rows={((charts.status ?? []) as Row[]).map((row) => [
            label(String(row.label)),
            Number(row.value),
          ])}
        />
        <ReportBreakdownChart
          title="Open workload by technician"
          rows={((charts.workload ?? []) as Row[]).map((row) => [
            String(row.name),
            Number(row.open),
          ])}
        />
      </div>
    </div>
  );
}
