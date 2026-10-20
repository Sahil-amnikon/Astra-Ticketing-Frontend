import UiIcon from '../ui-icon';
import ServiceDistribution from './service-distribution';
import { periodBalance, type ServiceReport } from './service-performance-data';

export default function ServicePerformanceView({
  data,
  changesVisible,
}: {
  data: ServiceReport;
  changesVisible: boolean;
}) {
  const { tickets } = data;
  const maxFlow = Math.max(1, tickets.created, tickets.resolved);
  const changeTotal = data.changes.reduce((sum, row) => sum + row.count, 0);
  const average = tickets.average_resolution_hours;
  return (
    <>
      <div className="service-delivery-grid">
        <section
          className="service-panel service-flow"
          aria-label="Ticket throughput"
        >
          <header className="service-panel-heading">
            <div>
              <span className="service-kicker">PERIOD ACTIVITY</span>
              <h2>Demand meets delivery</h2>
            </div>
            <span className="service-panel-icon">
              <UiIcon name="tickets" />
            </span>
          </header>
          <div className="service-flow-numbers">
            <div>
              <span className="service-dot service-blue" />
              <span>Tickets created</span>
              <strong>{tickets.created.toLocaleString()}</strong>
              <small>New demand in this period</small>
            </div>
            <div>
              <span className="service-dot service-teal" />
              <span>Tickets resolved</span>
              <strong>{tickets.resolved.toLocaleString()}</strong>
              <small>Resolutions recorded in this period</small>
            </div>
          </div>
          <div
            className="service-flow-bars"
            aria-label="Created and resolved ticket counts"
          >
            <div>
              <span>Created</span>
              <div className="service-flow-track">
                <span
                  className="service-blue"
                  style={{ width: `${(tickets.created / maxFlow) * 100}%` }}
                />
              </div>
              <strong>{tickets.created.toLocaleString()}</strong>
            </div>
            <div>
              <span>Resolved</span>
              <div className="service-flow-track">
                <span
                  className="service-teal"
                  style={{ width: `${(tickets.resolved / maxFlow) * 100}%` }}
                />
              </div>
              <strong>{tickets.resolved.toLocaleString()}</strong>
            </div>
          </div>
          <footer className="service-flow-note">
            <UiIcon name="pulse" />
            <span>{periodBalance(data)}</span>
          </footer>
        </section>
        <section className="service-backlog" aria-label="Current backlog">
          <div className="service-backlog-heading">
            <span className="service-kicker">CURRENT BACKLOG</span>
            <span className="service-backlog-icon">
              <UiIcon name="waiting" />
            </span>
          </div>
          <strong className="service-backlog-value">
            {tickets.open_now.toLocaleString()}
          </strong>
          <h2>Tickets open now</h2>
          <p>The work still ahead, across your selected organization scope.</p>
          <div className="service-backlog-note">
            <UiIcon name="clock" />
            <span>Current snapshot · independent of the reporting window</span>
          </div>
        </section>
      </div>
      <div className="service-stat-grid">
        <section className="service-stat">
          <span className="service-stat-icon service-stat-lilac">
            <UiIcon name="clock" />
          </span>
          <div>
            <h2>Average resolution time</h2>
            <strong>
              {average == null
                ? '—'
                : Number(average).toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })}
              {average == null ? null : <small>hours</small>}
            </strong>
            <p>
              {average == null
                ? 'No resolutions in this period'
                : 'Elapsed time, including pauses'}
            </p>
          </div>
        </section>
        <section className="service-stat">
          <span className="service-stat-icon service-stat-teal">
            <UiIcon name="categories" />
          </span>
          <div>
            <h2>Knowledge connections</h2>
            <strong>{data.knowledge.article_links.toLocaleString()}</strong>
            <p>Article links added to tickets in this period</p>
          </div>
        </section>
        <section className="service-stat">
          <span className="service-stat-icon service-stat-blue">
            <UiIcon name="change" />
          </span>
          <div>
            <h2>Changes raised</h2>
            <strong>
              {changesVisible ? changeTotal.toLocaleString() : '—'}
            </strong>
            <p>
              {changesVisible
                ? 'Visible changes created in this period'
                : 'Change access is required'}
            </p>
          </div>
        </section>
      </div>
      <div className="service-distribution-grid">
        <ServiceDistribution
          kind="sources"
          rows={data.sources.map((row) => ({
            label: row.source,
            count: row.count,
          }))}
        />
        <ServiceDistribution
          kind="changes"
          visible={changesVisible}
          rows={data.changes.map((row) => ({
            label: row.status,
            count: row.count,
          }))}
        />
      </div>
      <section className="service-reading" aria-label="Performance context">
        <span className="service-reading-icon">
          <UiIcon name="reports" />
        </span>
        <div>
          <span className="service-kicker">READING THIS OVERVIEW</span>
          <h2>Activity in the period. Backlog as it stands.</h2>
          <p>
            Created and resolved tickets use their own event dates. A resolution
            may relate to a ticket opened before this period, so the comparison
            shows activity volumes.
          </p>
        </div>
      </section>
      <details className="service-definitions">
        <summary>
          How these metrics are measured{' '}
          <span>UTC dates · selected organization scope</span>
        </summary>
        <dl>
          <div>
            <dt>Created and resolved</dt>
            <dd>
              Each uses its respective event date within the inclusive selected
              UTC date range. Their difference is not a backlog change or a
              resolution rate.
            </dd>
          </div>
          <div>
            <dt>Open now</dt>
            <dd>
              All current tickets in the selected scope except resolved, closed
              and cancelled, regardless of creation date.
            </dd>
          </div>
          <div>
            <dt>Average resolution time</dt>
            <dd>
              Elapsed hours from creation to resolution for tickets resolved in
              the period, including pauses. This is not an SLA compliance score.
            </dd>
          </div>
          <div>
            <dt>Sources, changes and knowledge</dt>
            <dd>
              Sources describe tickets created in the period. Changes show
              current statuses of visible changes created in the period.
              Knowledge counts article links added in the period.
            </dd>
          </div>
        </dl>
      </details>
    </>
  );
}
