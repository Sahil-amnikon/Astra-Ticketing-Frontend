'use client';
import { useEffect, useRef, useState } from 'react';
import ReportBreakdownChart from './report-breakdown-chart';
import {
  breakdown,
  downloadReport,
  sameReportFilters,
  type ReportFilters,
} from './module-report-data';
import {
  collectOverview,
  overviewModules,
  overviewNumbers,
  overviewLifecycle,
  overviewSummaryCsv,
  overviewMetadata,
  overviewRecords,
  type OverviewReport,
} from './overview-report-data';
import {
  overviewGraphic,
  downloadOverviewFile,
  downloadOverviewPng,
} from './overview-report-graphic';
import type { ApiRequest, Option } from '../workspace-tools';

export default function HolisticReports({
  request,
  allowed,
}: {
  request: ApiRequest;
  allowed: boolean;
}) {
  const [filters, setFilters] = useState<ReportFilters>(() => {
    const now = new Date();
    return {
      from: new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
      clientId: '',
      q: '',
      status: '',
    };
  });
  const [clients, setClients] = useState<Option[]>([]);
  const [optionsError, setOptionsError] = useState('');
  const [report, setReport] = useState<OverviewReport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!allowed) return;
    const abort = new AbortController();
    void Promise.all(
      overviewModules.map((module) =>
        request<{ clients: Option[] }>(`/${module.kind}/options`, {
          signal: abort.signal,
        }),
      ),
    )
      .then((results) => {
        if (!abort.signal.aborted)
          setClients(
            [
              ...new Map(
                results
                  .flatMap((result) => result.clients)
                  .map((client) => [client.id, client]),
              ).values(),
            ].sort((a, b) => a.name.localeCompare(b.name)),
          );
      })
      .catch((reason) => {
        if (!abort.signal.aborted) setOptionsError((reason as Error).message);
      });
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, [allowed, request]);
  const dirty = !report || !sameReportFilters(filters, report.filters);
  const disabled = !allowed || !report || dirty || busy || exporting;
  async function generate() {
    if (!allowed || busy) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    setExportError('');
    setReport(undefined);
    const applied = { ...filters };
    try {
      const modules = await collectOverview(request, applied, abort.signal);
      if (!abort.signal.aborted)
        setReport({
          modules,
          filters: applied,
          clientName:
            clients.find((client) => client.id === applied.clientId)?.name ??
            'All accessible clients',
          generatedAt: new Date().toISOString(),
        });
    } catch (reason) {
      if (!abort.signal.aborted) setError((reason as Error).message);
    } finally {
      abort.abort();
      if (controller.current === abort) setBusy(false);
    }
  }
  async function exportFile(
    format: 'excel' | 'png' | 'svg' | 'summary' | 'records',
  ) {
    if (disabled || !report) return;
    setExporting(true);
    setExportError('');
    const name = `astra-overview-${report.filters.from}-${report.filters.to}`;
    try {
      if (format === 'excel') {
        const { createOverviewExcel } = await import('./report-excel');
        const bytes = createOverviewExcel(report);
        downloadOverviewFile(
          `${name}.xlsx`,
          new Blob([bytes.buffer as ArrayBuffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        );
      } else if (format === 'png') await downloadOverviewPng(report);
      else if (format === 'svg')
        downloadOverviewFile(
          `${name}.svg`,
          new Blob([overviewGraphic(report)], { type: 'image/svg+xml' }),
        );
      else
        downloadReport(
          `${name}-${format}.csv`,
          format === 'summary'
            ? overviewSummaryCsv(report)
            : [...overviewMetadata(report), [], ...overviewRecords(report)],
        );
    } catch (reason) {
      setExportError((reason as Error).message);
    } finally {
      setExporting(false);
    }
  }
  if (!allowed)
    return (
      <section className="panel" role="alert">
        Select the Management or Administration workspace with report access to
        generate a holistic overview.
      </section>
    );
  const numbers = report ? overviewNumbers(report) : [];
  const sum = (
    key: 'total' | 'active' | 'completed' | 'cancelled' | 'failed',
  ) => numbers.reduce((total, module) => total + module[key], 0);
  return (
    <section
      className="management-reporting holistic-report"
      aria-label="Holistic overview report"
    >
      <section className="panel management-report-builder">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ALL SERVICE MODULES</p>
            <h2>Holistic overview report</h2>
            <p className="hint">
              One report for Tickets, Change Management and Problem Management.
            </p>
          </div>
          <span className="corporate-pill">Overview · Read only</span>
        </div>
        <form
          className="management-report-fields"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <label>
            Overview created from (UTC)
            <input
              type="date"
              required
              max={filters.to}
              disabled={busy || exporting}
              value={filters.from}
              onChange={(event) =>
                setFilters({ ...filters, from: event.target.value })
              }
            />
          </label>
          <label>
            Overview created through (UTC)
            <input
              type="date"
              required
              min={filters.from}
              disabled={busy || exporting}
              value={filters.to}
              onChange={(event) =>
                setFilters({ ...filters, to: event.target.value })
              }
            />
          </label>
          <label>
            Overview client
            <select
              disabled={busy || exporting}
              value={filters.clientId}
              onChange={(event) =>
                setFilters({ ...filters, clientId: event.target.value })
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
            Overview search
            <input
              maxLength={200}
              placeholder="Reference or title"
              disabled={busy || exporting}
              value={filters.q}
              onChange={(event) =>
                setFilters({ ...filters, q: event.target.value })
              }
            />
          </label>
          <button className="primary" disabled={busy || exporting}>
            {busy ? 'Generating overview…' : 'Generate overview'}
          </button>
        </form>
        <p className="hint">
          Includes records created in the selected UTC period. Status, owner,
          SLA and risk show current values. Linked records count once in each
          module. Each module supports up to 5,000 accessible records; narrow
          the selection if needed.
        </p>
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
        <div className="management-presets" aria-label="Overview downloads">
          {(
            [
              ['excel', 'Download overview Excel'],
              ['png', 'Download graphical PNG'],
              ['svg', 'Download graphical SVG'],
              ['summary', 'Download overall numbers CSV'],
              ['records', 'Download combined records CSV'],
            ] as const
          ).map(([format, name]) => (
            <button
              key={format}
              type="button"
              className={format === 'excel' ? 'primary' : 'secondary'}
              disabled={disabled}
              onClick={() => void exportFile(format)}
            >
              {name}
            </button>
          ))}
        </div>
        {exporting ? <p role="status">Preparing download…</p> : null}
        {exportError ? (
          <p className="notice error" role="alert">
            {exportError}
          </p>
        ) : null}
        {report && dirty ? (
          <p className="notice" role="status">
            Filters changed. Generate the overview again to update results and
            downloads.
          </p>
        ) : null}
        {!report && !busy && !error ? (
          <p className="hint">
            Choose your filters and generate the overview to see charts and
            overall numbers.
          </p>
        ) : null}
      </section>
      {report ? (
        <div className="management-report-results">
          <p className="hint">
            Created {report.filters.from} through {report.filters.to} (UTC) ·{' '}
            {report.clientName} · Generated {report.generatedAt}
          </p>
          <div className="management-summary-grid">
            {[
              ['Overall records', sum('total')],
              ...numbers.map((module) => [module.name, module.total]),
              ['Active records', sum('active')],
            ].map(([name, count]) => (
              <article className="panel" key={name}>
                <small>{name}</small>
                <strong>{count.toLocaleString()}</strong>
              </article>
            ))}
          </div>
          <div className="management-chart-grid">
            <ReportBreakdownChart
              title="Records by module"
              variant="donut"
              rows={numbers.map((module) => [module.name, module.total])}
            />
            <ReportBreakdownChart
              title="Current lifecycle across modules"
              rows={overviewLifecycle(report)}
            />
          </div>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Overall numbers</h2>
                <p className="hint">
                  Resolved / completed excludes cancelled, rejected, failed and
                  rolled-back records. Active records belong to the selected
                  created period.
                </p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      'Module',
                      'Total',
                      'Active',
                      'Resolved / completed',
                      'Cancelled / rejected',
                      'Failed / rolled back',
                      'Attention indicator',
                      'Attention count',
                    ].map((name) => (
                      <th key={name}>{name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {numbers.map((module) => (
                    <tr key={module.kind}>
                      <th scope="row">{module.name}</th>
                      <td>{module.total}</td>
                      <td>{module.active}</td>
                      <td>{module.completed}</td>
                      <td>{module.cancelled}</td>
                      <td>{module.failed}</td>
                      <td>{module.indicator}</td>
                      <td>{module.attention}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Overall</th>
                    {(
                      [
                        'total',
                        'active',
                        'completed',
                        'cancelled',
                        'failed',
                      ] as const
                    ).map((key) => (
                      <td key={key}>
                        <strong>{sum(key)}</strong>
                      </td>
                    ))}
                    <td colSpan={2}>Indicators are specific to each module.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <div className="management-chart-grid">
            {overviewModules.map((module) => (
              <ReportBreakdownChart
                key={module.kind}
                title={`${module.name} by status`}
                rows={breakdown(report.modules[module.kind], 'status')}
                variant="stacked"
              />
            ))}
          </div>
          {!sum('total') ? (
            <p className="notice" role="status">
              No records match the overview filters. Downloads include the zero
              totals and report period.
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="hint">
        Technician activity below has its own filters and uses assignment and
        transfer history.
      </p>
    </section>
  );
}
