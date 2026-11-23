'use client';
import Link from '../navigation/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import UiIcon, { type IconName } from './ui-icon';

type Row = Record<string, unknown>;
const count = (value: unknown) => Math.max(0, Number(value) || 0);
const format = (value: unknown) => count(value).toLocaleString();

export default function CorporateDashboard({
  mode,
  userId,
  counts,
  trend,
  distributions,
  recent,
}: {
  mode: 'technician' | 'management' | 'admin';
  userId: string;
  counts: Row;
  trend: Row[];
  distributions: ReactNode;
  recent: ReactNode;
}) {
  const wide = mode !== 'technician';
  const base =
    mode === 'admin'
      ? '/admin'
      : mode === 'management'
        ? '/management'
        : '/operations';
  const queue = `${base}/tickets`;
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
    ...([
      ['waiting_for_client', 'Waiting for client', 'WAITING_FOR_CLIENT'],
      ['waiting_for_vendor', 'Waiting for vendor', 'WAITING_FOR_VENDOR'],
      ['on_hold', 'On hold', 'ON_HOLD'],
      ['resolved', 'Resolved', 'RESOLVED'],
      ['closed', 'Closed', 'CLOSED'],
      ['cancelled', 'Cancelled', 'CANCELLED'],
    ] as const).map(([key, label, status]) => ({
      key, label, icon: 'tickets' as IconName, tone: 'blue', query: '?status=' + status,
    })),
    {
      key: wide ? 'recently_resolved' : 'pending_approval',
      label: wide ? 'Resolved this week' : 'Pending approval',
      icon: 'check', tone: 'teal',
      query: wide ? '?dashboardFilter=RESOLVED_RECENTLY' : '?dashboardFilter=PENDING_APPROVAL',
    },
  ];
  const storageKey = 'astra:glance:v1:' + userId + ':' + mode;
  const defaults = cards.slice(0, 8).map((card) => card.key);
  const [selection, setSelection] = useState<string[]>(defaults);
  const [loadedKey, setLoadedKey] = useState('');
  const [saveError, setSaveError] = useState(false);
  const picker = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    let selected = defaults;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (Array.isArray(saved)) selected = [...new Set(saved.filter(
        (key): key is string => typeof key === 'string' && cards.some((card) => card.key === key),
      ))].slice(0, 8);
    } catch { /* Fall back to defaults if browser storage is unavailable. */ }
    setSelection(selected);
    setLoadedKey(storageKey);
    setSaveError(false);
  }, [storageKey]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (picker.current && !picker.current.contains(event.target as Node)) picker.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const selected = loadedKey === storageKey ? selection : defaults;
  function updateSelection(next: string[]) {
    setSelection(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaveError(false);
    } catch { setSaveError(true); }
  }
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
        <Link className="primary" href={wide ? queue : '/operations/new'}>
          <UiIcon name={wide ? 'tickets' : 'pulse'} />
          {wide ? 'Open ticket queue' : 'New ticket'}
        </Link>
      </header>
      <div className="corporate-section-label">
        <div className="glance-controls">
          <details className="glance-picker" ref={picker} onKeyDown={(event) => {
            if (event.key === 'Escape' && picker.current) {
              picker.current.open = false;
              picker.current.querySelector('summary')?.focus();
            }
          }}>
            <summary><UiIcon name="pulse" />Ticket Status <span>{selected.length}/8</span></summary>
            <div className="glance-picker-panel">
              <strong>Choose up to 8 cards</strong>
              <p id="glance-limit" role="status">{selected.length === 8 ? 'Limit reached. Deselect a card to choose another.' : selected.length + ' of 8 cards selected'}</p>
              <div className="glance-options">
                {cards.map((card) => (
                  <label key={card.key}>
                    <input type="checkbox" checked={selected.includes(card.key)}
                      disabled={selected.length >= 8 && !selected.includes(card.key)}
                      aria-describedby="glance-limit"
                      onChange={(event) => updateSelection(event.target.checked
                        ? [...selected, card.key].slice(0, 8)
                        : selected.filter((key) => key !== card.key))} />
                    {card.label}
                  </label>
                ))}
              </div>
              <div className="glance-picker-actions">
                <button type="button" onClick={() => updateSelection(defaults)}>Reset to default</button>
                <button type="button" onClick={() => updateSelection([])} disabled={selected.length === 0}>Clear all</button>
              </div>
              {saveError && <p role="status">Your choices apply now, but could not be saved in this browser.</p>}
            </div>
          </details>
        </div>
        <span>
          {wide ? 'All accessible tickets' : 'Your assigned tickets'} · Current
          snapshot
        </span>
      </div>
      {selected.length > 0 && <div className="corporate-metrics">
        {cards.filter((card) => selected.includes(card.key)).map((card) => {
          const content = (
            <>
              <span className={`corporate-metric-icon ${card.tone}`}>
                <UiIcon name={card.icon} />
              </span>
              <div>
                <small>{card.label}</small>
                <strong>{format(counts[card.key])}</strong>
              </div>
              {card.query !== undefined ? (
                <span className="corporate-metric-arrow" aria-hidden="true">
                  ↗
                </span>
              ) : null}
            </>
          );
          return card.query !== undefined ? (
            <Link
              key={card.key}
              className="corporate-metric"
              href={`${queue}${card.query ?? ''}`}
              aria-label={`${card.label}: ${format(counts[card.key])}. Open ticket queue.`}
            >
              {content}
            </Link>
          ) : (
            <article key={card.key} className="corporate-metric">
              {content}
            </article>
          );
        })}
      </div>}
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
            href={`${queue}?slaStatus=BREACHED`}
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
            href={`${queue}?slaStatus=AT_RISK`}
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
              stroke="#0b8079"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <polyline
              points={points('resolved')}
              fill="none"
              stroke="#527ec2"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {rows.map((row, i) => (
              <g key={String(row.day)}>
                <circle cx={x(i)} cy={y(row.created)} r="3" fill="#0b8079">
                  <title>
                    {String(row.day)}: {count(row.created)} created
                  </title>
                </circle>
                <circle cx={x(i)} cy={y(row.resolved)} r="3" fill="#527ec2">
                  <title>
                    {String(row.day)}: {count(row.resolved)} resolved
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
