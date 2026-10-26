'use client';
import Link from 'next/link';
import MetricCard from '../../components/ui/MetricCard';
import type { ReactNode } from 'react';
import UiIcon, { type IconName } from '../../components/ui/UiIcon';

type Row = Record<string, unknown>;
const count = (value: unknown) => Math.max(0, Number(value) || 0);
const format = (value: unknown) => count(value).toLocaleString();

export default function CorporateDashboard({
  mode,
  counts,
  trend,
  distributions,
  recent,
  queueHref,
  newTicketHref,
}: {
  mode: 'technician' | 'management' | 'admin';
  counts: Row;
  trend: Row[];
  distributions: ReactNode;
  recent: ReactNode;
  queueHref?: string;
  newTicketHref?: string;
}) {
  const wide = mode !== 'technician';
  const base =
    mode === 'admin'
      ? '/admin'
      : mode === 'management'
        ? '/management'
        : '/operations';
  const queue = queueHref ?? `${base}/tickets`;
  const filteredQueue = (query: string) =>
    `${queue}${queue.includes('?') ? query.replace('?', '&') : query}`;
  const cards: {
    key: string;
    label: string;
    icon: IconName;
    tone: string;
    query?: string;
  }[] = [
    {
      key: 'open',
      label: 'Open tickets',
      icon: 'tickets',
      tone: 'teal',
      query: '',
    },
    {
      key: 'new',
      label: 'New tickets',
      icon: 'pulse',
      tone: 'blue',
      query: '?status=NEW',
    },
    {
      key: 'in_progress',
      label: 'In progress',
      icon: 'clock',
      tone: 'blue',
      query: '?status=IN_PROGRESS',
    },
    {
      key: 'waiting',
      label: 'Waiting',
      icon: 'waiting',
      tone: 'amber',
      query: '?dashboardFilter=WAITING',
    },
    {
      key: wide ? 'pending_approval' : 'recently_resolved',
      label: wide ? 'Pending approval' : 'Resolved this week',
      query: wide
        ? '?dashboardFilter=PENDING_APPROVAL'
        : '?dashboardFilter=RESOLVED_RECENTLY',
      icon: 'check',
      tone: 'teal',
    },
    {
      key: 'sla_at_risk',
      label: 'SLA at risk',
      icon: 'alert',
      tone: 'amber',
      query: '?slaStatus=AT_RISK',
    },
    {
      key: 'sla_breached',
      label: 'SLA breached',
      icon: 'alert',
      tone: 'red',
      query: '?slaStatus=BREACHED',
    },
    {
      key: 'unattended',
      label: 'Awaiting first response',
      query: '?dashboardFilter=AWAITING_FIRST_RESPONSE',
      icon: 'pulse',
      tone: 'blue',
    },
  ];
  return (
    <div className="corporate-dashboard">
      <header className="corporate-heading">
        <div>
          <p className="eyebrow">
            {wide
              ? 'SERVICE OPERATIONS / ALL TICKETS'
              : 'MY WORKSPACE / ASSIGNED TICKETS'}
          </p>
          <h1>
            {mode === 'admin'
              ? 'Service desk overview'
              : mode === 'management'
                ? 'Management overview'
                : 'My service desk'}
          </h1>
          <p>
            {wide
              ? 'A clear view of your service desk, team workload and service commitments.'
              : 'Your workload, service priorities and recent conversations in one place.'}
          </p>
        </div>
        <Link
          className="primary"
          href={wide ? queue : (newTicketHref ?? '/operations/new')}
        >
          <UiIcon name={wide ? 'tickets' : 'pulse'} />
          {wide ? 'Open ticket queue' : 'New ticket'}
        </Link>
      </header>
      <div className="corporate-section-label">
        <h2>At a glance</h2>
        <span>
          {wide ? 'All accessible tickets' : 'Your assigned tickets'} · Current
          snapshot
        </span>
      </div>
      <div className="corporate-metrics">
        {cards.map((card) => (
          <MetricCard
            key={card.key}
            label={card.label}
            value={format(counts[card.key])}
            icon={<UiIcon name={card.icon} />}
            tone={card.tone}
            href={
              card.query !== undefined ? filteredQueue(card.query) : undefined
            }
          />
        ))}
      </div>
      <div className="corporate-main-grid">
        <TicketTrend rows={trend} />
        <section className="panel corporate-attention">
          <div className="section-heading">
            <h2>Needs attention</h2>
            <span className="corporate-pill">Service priorities</span>
          </div>
          <p className="hint">
            Focus on time-sensitive work in this workspace.
          </p>
          <Link
            className="corporate-attention-row"
            href={filteredQueue('?slaStatus=BREACHED')}
          >
            <span className="corporate-attention-dot red" />
            <div>
              <strong>SLA breached</strong>
              <small>Review response and resolution commitments</small>
            </div>
            <b>{format(counts.sla_breached)}</b>
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            className="corporate-attention-row"
            href={filteredQueue('?slaStatus=AT_RISK')}
          >
            <span className="corporate-attention-dot amber" />
            <div>
              <strong>SLA at risk</strong>
              <small>Prioritize tickets approaching their target</small>
            </div>
            <b>{format(counts.sla_at_risk)}</b>
            <span aria-hidden="true">→</span>
          </Link>
          <div className="corporate-attention-row">
            <span className="corporate-attention-dot blue" />
            <div>
              <strong>Awaiting first response</strong>
              <small>Review the queue for tickets awaiting a reply</small>
            </div>
            <b>{format(counts.unattended)}</b>
          </div>
          <Link className="corporate-queue-link" href={queue}>
            Review ticket queue <span aria-hidden="true">→</span>
          </Link>
        </section>
      </div>
      <div className="corporate-section-label">
        <h2>Workload & ticket mix</h2>
        <span>Understand where work is concentrated</span>
      </div>
      <div className="corporate-distributions">{distributions}</div>
      <section className="panel corporate-recent">
        <div className="section-heading">
          <div>
            <h2>Recently updated tickets</h2>
            <p className="hint">
              Continue the latest activity in this workspace.
            </p>
          </div>
          <Link href={queue}>View queue →</Link>
        </div>
        {recent}
      </section>
    </div>
  );
}

function TicketTrend({ rows }: { rows: Row[] }) {
  const max = Math.max(
    1,
    ...rows.flatMap((row) => [count(row.created), count(row.resolved)]),
  );
  const left = 38,
    top = 20,
    width = 620,
    height = 150;
  const x = (i: number) =>
    left + (rows.length <= 1 ? width / 2 : (i * width) / (rows.length - 1));
  const y = (value: unknown) => top + height - (count(value) / max) * height;
  const points = (key: string) =>
    rows.map((row, i) => `${x(i)},${y(row[key])}`).join(' ');
  const created = rows.reduce((sum, row) => sum + count(row.created), 0);
  const resolved = rows.reduce((sum, row) => sum + count(row.resolved), 0);
  return (
    <section className="panel corporate-trend">
      <div className="section-heading">
        <div>
          <h2>Ticket activity</h2>
          <p className="hint">Created and resolved during the last 14 days</p>
        </div>
        <span className="corporate-pill">14 days</span>
      </div>
      <div className="corporate-trend-summary">
        <span>
          <i className="corporate-attention-dot teal" />
          <b>{created.toLocaleString()}</b> Created
        </span>
        <span>
          <i className="corporate-attention-dot blue" />
          <b>{resolved.toLocaleString()}</b> Resolved
        </span>
      </div>
      {rows.length ? (
        <>
          <svg
            className="corporate-trend-svg"
            viewBox="0 0 680 207"
            role="img"
            aria-label="14-day ticket activity. Exact daily values are available in the table below."
          >
            <title>Tickets created and resolved over 14 days</title>
            {[0, 0.5, 1].map((ratio) => (
              <g key={ratio}>
                <line
                  x1={left}
                  x2={left + width}
                  y1={top + ratio * height}
                  y2={top + ratio * height}
                  stroke="#e4ebee"
                />
                <text
                  x={left - 8}
                  y={top + ratio * height + 4}
                  textAnchor="end"
                >
                  {Math.round(max * (1 - ratio))}
                </text>
              </g>
            ))}
            <polyline
              points={points('created')}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <polyline
              points={points('resolved')}
              fill="none"
              stroke="#16a34a"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {rows.map((row, i) => (
              <g key={String(row.day)}>
                <circle cx={x(i)} cy={y(row.created)} r="3" fill="#2563eb">
                  <title>
                    {`${String(row.day)}: ${count(row.created)} created`}
                  </title>
                </circle>
                <circle cx={x(i)} cy={y(row.resolved)} r="3" fill="#16a34a">
                  <title>
                    {`${String(row.day)}: ${count(row.resolved)} resolved`}
                  </title>
                </circle>
                {(i === 0 || i === rows.length - 1 || i % 3 === 0) && (
                  <text x={x(i)} y="195" textAnchor="middle">
                    {String(row.day).slice(5)}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <details className="corporate-trend-data">
            <summary>View daily counts</summary>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Daily ticket activity</caption>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Created</th>
                    <th>Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.day)}>
                      <td>{String(row.day)}</td>
                      <td>{count(row.created)}</td>
                      <td>{count(row.resolved)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="empty">No ticket activity yet.</p>
      )}
    </section>
  );
}
