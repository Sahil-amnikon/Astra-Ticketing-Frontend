'use client';
import { hasFullAccess } from '../role-access';

import { useEffect, useState } from 'react';
import UiIcon from '../ui-icon';
import {
  WorkspaceFrame,
  useWorkspace,
  SelectOptions,
  type Option,
} from '../workspace-tools';
import { downloadReport } from '../management/module-report-data';
import ServicePerformanceView from './service-performance-view';
import {
  initialRange,
  rangeMatches,
  rangeValid,
  displayDate,
  serviceCsvRows,
  type ServiceReport,
  type ServiceRange,
} from './service-performance-data';
import './service-performance.css';

export default function ServiceReports() {
  const w = useWorkspace();
  const { request, session } = w;
  const [draft, setDraft] = useState<ServiceRange>(initialRange);
  const [applied, setApplied] = useState<ServiceRange>(initialRange);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ServiceReport>();
  const [clients, setClients] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState('');
  const allowed = Boolean(
    session &&
    (hasFullAccess(session.user.roles) ||
      session.user.permissions?.includes('REPORTS_VIEW')),
  );
  const changesVisible = Boolean(
    session &&
    (hasFullAccess(session.user.roles) ||
      (session.user.changeAccess && session.user.changeAccess !== 'NONE')),
  );
  const dirty = !rangeMatches(draft, applied);
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const controller = new AbortController();
    const query = new URLSearchParams({ from: applied.from, to: applied.to });
    if (applied.clientId) query.set('clientId', applied.clientId);
    void request<ServiceReport>('/service-reports?' + query, {
      signal: controller.signal,
    })
      .then((result) => {
        if (live) {
          setData(result);
          setClients(result.clients);
          setGeneratedAt(new Date().toISOString());
        }
      })
      .catch((reason) => {
        if (live && reason.name !== 'AbortError') {
          setData(undefined);
          setError(reason.message);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [allowed, applied, revision, request]);
  function generate() {
    if (loading || !allowed) return;
    if (!rangeValid(draft)) {
      setError('Choose a valid date range of no more than one year.');
      return;
    }
    setLoading(true);
    setError('');
    setData(undefined);
    setApplied({ ...draft });
    setRevision((value) => value + 1);
  }
  function preset(days: number | 'month') {
    const range = initialRange(typeof days === 'number' ? days : 30);
    if (days === 'month') range.from = range.to.slice(0, 7) + '-01';
    setDraft({ ...range, clientId: draft.clientId });
  }
  const organization =
    data?.clients.find((client) => client.id === data.clientId)?.name ??
    'All assigned organizations';
  const hero = (
    <header className="service-performance-hero">
      <div className="service-hero-copy">
        <span className="service-hero-kicker">
          <UiIcon name="pulse" /> SERVICE OVERVIEW
        </span>
        <h1>Service performance</h1>
        <p>Your service desk, at a glance.</p>
        <span className="service-hero-description">
          Understand demand, delivery and the work still ahead.
        </span>
      </div>
      <div className="service-hero-scope">
        <span>REPORTING WINDOW · UTC</span>
        <strong>
          {displayDate(data?.from ?? applied.from)} <span>—</span>{' '}
          {displayDate(data?.to ?? applied.to)}
        </strong>
        <p>{data ? organization : 'Your authorized service scope'}</p>
        <small>
          {generatedAt && data
            ? 'Updated ' +
              new Date(generatedAt).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'UTC',
              }) +
              ' UTC'
            : 'Select a period to review service performance'}
        </small>
      </div>
    </header>
  );
  return (
    <WorkspaceFrame
      title="Service performance"
      pageHeading={hero}
      user={session?.user}
      csrfToken={session?.csrfToken}
      error={w.error}
    >
      {!allowed ? (
        <section className="service-performance">
          <p className="notice error" role="alert">
            Report access is required to view service performance.
          </p>
        </section>
      ) : (
        <div className="service-performance">
          <section className="service-scope-panel" aria-label="Reporting scope">
            <div className="service-scope-heading">
              <div>
                <span className="service-kicker">REPORTING SCOPE</span>
                <h2>Choose your view</h2>
              </div>
              <div className="service-presets" aria-label="Date presets">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => preset('month')}
                >
                  This month
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => preset(30)}
                >
                  Last 30 days
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => preset(90)}
                >
                  Last 90 days
                </button>
              </div>
            </div>
            <form
              className="service-filter-form"
              onSubmit={(event) => {
                event.preventDefault();
                generate();
              }}
            >
              <label>
                From (UTC)
                <input
                  type="date"
                  required
                  value={draft.from}
                  max={draft.to}
                  disabled={loading}
                  onChange={(event) =>
                    setDraft({ ...draft, from: event.target.value })
                  }
                />
              </label>
              <label>
                Through (UTC)
                <input
                  type="date"
                  required
                  value={draft.to}
                  min={draft.from}
                  disabled={loading}
                  onChange={(event) =>
                    setDraft({ ...draft, to: event.target.value })
                  }
                />
              </label>
              <label>
                Organization
                <select
                  value={draft.clientId}
                  disabled={loading}
                  onChange={(event) =>
                    setDraft({ ...draft, clientId: event.target.value })
                  }
                >
                  <option value="">All assigned organizations</option>
                  <SelectOptions items={clients} />
                </select>
              </label>
              <button type="submit" className="primary" disabled={loading}>
                {loading ? 'Generating…' : 'Generate report'}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={!data || dirty || loading || Boolean(error)}
                onClick={() => {
                  if (data && !dirty && !loading && !error)
                    downloadReport(
                      'amnikon-service-performance-' +
                        data.from +
                        '-' +
                        data.to +
                        '.csv',
                      serviceCsvRows(data, generatedAt),
                    );
                }}
              >
                <UiIcon name="reports" /> Export CSV
              </button>
            </form>
          </section>
          {loading ? (
            <div className="service-loading" role="status">
              <UiIcon name="pulse" />
              <div>
                <strong>Preparing your service overview</strong>
                <p>Loading throughput, backlog, sources and change outcomes.</p>
              </div>
            </div>
          ) : null}
          {error ? (
            <p className="notice error" role="alert">
              {error} Generate the report to retry.
            </p>
          ) : null}
          {dirty && data ? (
            <p className="service-draft-notice" role="status">
              Your filters have changed. Generate the report to update this view
              and enable export.
            </p>
          ) : null}
          {data ? (
            <ServicePerformanceView
              data={data}
              changesVisible={changesVisible}
            />
          ) : null}
        </div>
      )}
    </WorkspaceFrame>
  );
}
