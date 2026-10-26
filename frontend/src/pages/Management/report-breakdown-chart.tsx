import type { CSSProperties } from 'react';

const palette = [
  '#3563ef',
  '#8b5cf6',
  '#06a6a0',
  '#e8a022',
  '#e96991',
  '#4097d8',
  '#635bce',
  '#8da544',
];
const colours: Record<string, string> = {
  NEW: '#3563ef',
  OPEN: '#3563ef',
  IN_PROGRESS: '#8b5cf6',
  ASSESSMENT: '#8b5cf6',
  WAITING_FOR_CLIENT: '#e8a022',
  WAITING_FOR_VENDOR: '#dd8a28',
  AWAITING_APPROVAL: '#e8a022',
  ON_HOLD: '#dd8a28',
  DRAFT: '#8492a8',
  CANCELLED: '#8492a8',
  RESOLVED: '#06a6a0',
  CLOSED: '#06a6a0',
  COMPLETED: '#06a6a0',
  APPROVED: '#4097d8',
  SCHEDULED: '#635bce',
  VALIDATION: '#4097d8',
  FAILED: '#e45664',
  REJECTED: '#e45664',
  ROLLED_BACK: '#e96991',
  EMAIL: '#3563ef',
  CLIENT_PORTAL: '#8b5cf6',
  MICROSOFT_TEAMS: '#635bce',
  PHONE_CALL: '#06a6a0',
  SMS: '#e8a022',
  MISSIVE: '#4097d8',
  OTHER: '#8492a8',
};
function colour(name: string) {
  const key = name.toUpperCase().replaceAll(' ', '_');
  if (colours[key]) return colours[key];
  let hash = 0;
  for (const character of name)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}
function display(name: string) {
  if (name !== name.toUpperCase()) return name;
  return name
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bSms\b/g, 'SMS')
    .replace(/\bSla\b/g, 'SLA');
}
export default function ReportBreakdownChart({
  title,
  rows,
  variant = 'bars',
}: {
  title: string;
  rows: [string, number][];
  variant?: 'donut' | 'stacked' | 'bars';
}) {
  const items = rows.map(([name, count]) => ({
    name,
    count: Math.max(0, Number(count) || 0),
    colour: colour(name),
  }));
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const segments = items.filter((item) => item.count > 0);
  const gradient =
    variant === 'donut'
      ? segments
          .map((item, index) => {
            const start =
              (segments
                .slice(0, index)
                .reduce((sum, segment) => sum + segment.count, 0) /
                total) *
              100;
            const end = start + (item.count / total) * 100;
            return `${item.colour} ${start}% ${end}%`;
          })
          .join(',')
      : '';
  const largest = items.reduce<(typeof items)[number] | undefined>(
    (best, item) => (!best || item.count > best.count ? item : best),
    undefined,
  );
  return (
    <section
      className={`panel report-visual report-visual-${variant}`}
      aria-label={title}
    >
      <header className="report-visual-heading">
        <div>
          <span className="report-visual-eyebrow">DISTRIBUTION</span>
          <h2>{title}</h2>
        </div>
        <span className="report-visual-total">
          {total.toLocaleString()} <small>total</small>
        </span>
      </header>
      {total > 0 ? (
        <>
          <div className="report-visual-body">
            {variant === 'donut' ? (
              <div
                className="report-donut"
                style={{ background: `conic-gradient(${gradient})` }}
                role="img"
                aria-label={`${title}: ${total.toLocaleString()} total. Counts and percentages listed alongside.`}
              >
                <div className="report-donut-centre">
                  <strong>{total.toLocaleString()}</strong>
                  <span>Total records</span>
                </div>
              </div>
            ) : null}
            {variant === 'stacked' ? (
              <div className="report-stack-summary">
                <p>
                  <strong>
                    {items.filter((item) => item.count > 0).length}
                  </strong>{' '}
                  statuses represented
                </p>
                <div className="report-stacked-bar" aria-hidden="true">
                  {items
                    .filter((item) => item.count > 0)
                    .map((item) => (
                      <span
                        key={item.name}
                        style={{
                          width: `${(item.count / total) * 100}%`,
                          background: item.colour,
                        }}
                      />
                    ))}
                </div>
                <span className="hint">Share of the selected records</span>
              </div>
            ) : null}
            <ul
              className="report-visual-legend"
              tabIndex={0}
              aria-label={`${title} counts and percentages`}
            >
              {items.map((item) => {
                const share = (item.count / total) * 100;
                return (
                  <li
                    key={item.name}
                    className="report-visual-row"
                    style={{ '--report-colour': item.colour } as CSSProperties}
                  >
                    <div className="report-visual-row-heading">
                      <span className="report-visual-row-label">
                        <i aria-hidden="true" />
                        {display(item.name)}
                      </span>
                      <span className="report-visual-values">
                        <strong>{item.count.toLocaleString()}</strong>
                        <small>{share.toFixed(1)}%</small>
                      </span>
                    </div>
                    {variant === 'bars' ? (
                      <div className="report-bar-track" aria-hidden="true">
                        <span style={{ width: `${share}%` }} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
          <footer className="report-visual-footer">
            <span className="report-visual-footer-dot" aria-hidden="true" />
            <span>
              {largest ? (
                <>
                  <strong>{display(largest.name)}</strong> has the largest share
                  · {((largest.count / total) * 100).toFixed(1)}%
                </>
              ) : null}
            </span>
          </footer>
        </>
      ) : (
        <div className="report-visual-empty">
          <span aria-hidden="true">◌</span>
          <strong>No records to chart</strong>
          <p>Results will appear here when this report has matching records.</p>
        </div>
      )}
    </section>
  );
}
