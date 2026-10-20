import { displayLabel } from './service-performance-data';
const palette = [
  '#4265ee',
  '#8c63dd',
  '#19a296',
  '#e8a54b',
  '#dc7695',
  '#5a9ccc',
  '#748297',
];
const statusColors: Record<string, string> = {
  DRAFT: '#748297',
  ASSESSMENT: '#8c63dd',
  AWAITING_APPROVAL: '#e8a54b',
  APPROVED: '#5a9ccc',
  SCHEDULED: '#4265ee',
  IN_PROGRESS: '#8c63dd',
  COMPLETED: '#19a296',
  CLOSED: '#19a296',
  FAILED: '#db5e66',
  ROLLED_BACK: '#dc7695',
  CANCELLED: '#748297',
  REJECTED: '#db5e66',
};
export default function ServiceDistribution({
  rows,
  kind,
  visible = true,
}: {
  rows: { label: string; count: number }[];
  kind: 'sources' | 'changes';
  visible?: boolean;
}) {
  const items = rows.map((row, index) => ({
    ...row,
    color:
      kind === 'changes'
        ? (statusColors[row.label] ?? palette[index % palette.length])
        : palette[index % palette.length],
  }));
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const segments = items.map((item, index) => {
    const share = total ? item.count / total : 0;
    const start = total
      ? items
          .slice(0, index)
          .reduce((sum, previous) => sum + previous.count, 0) / total
      : 0;
    return { ...item, share, start };
  });
  return (
    <section
      className={`service-panel service-distribution service-distribution-${kind}`}
      aria-label={kind === 'sources' ? 'Request sources' : 'Change outcomes'}
    >
      <header className="service-panel-heading">
        <div>
          <span className="service-kicker">
            {kind === 'sources' ? 'DEMAND CHANNELS' : 'CHANGE DELIVERY'}
          </span>
          <h2>
            {kind === 'sources'
              ? 'Where requests come from'
              : 'Change outcomes'}
          </h2>
        </div>
        <span className="service-count">
          {visible ? total.toLocaleString() : '—'}
          <small>{kind === 'sources' ? 'tickets' : 'changes'}</small>
        </span>
      </header>
      {!visible ? (
        <p className="service-empty">
          Change reports are unavailable with your current change access.
        </p>
      ) : !total ? (
        <p className="service-empty">
          {kind === 'sources'
            ? 'No new tickets in the selected period.'
            : 'No changes were raised in the selected period.'}
        </p>
      ) : (
        <>
          {kind === 'sources' ? (
            <div className="service-source-layout">
              <div className="service-donut-wrap">
                <svg
                  viewBox="0 0 220 220"
                  className="service-donut"
                  role="img"
                  aria-label={`Request sources: ${total} tickets. Counts and percentages are listed alongside.`}
                >
                  <circle
                    cx="110"
                    cy="110"
                    r="84"
                    fill="none"
                    stroke="#edf1f7"
                    strokeWidth="23"
                  />
                  {segments
                    .filter((item) => item.count > 0)
                    .map((item) => (
                      <circle
                        key={item.label}
                        cx="110"
                        cy="110"
                        r="84"
                        pathLength="100"
                        fill="none"
                        stroke={item.color}
                        strokeWidth="23"
                        strokeDasharray={`${item.share * 100} ${100 - item.share * 100}`}
                        strokeDashoffset={-item.start * 100}
                        transform="rotate(-90 110 110)"
                      />
                    ))}
                  <text
                    x="110"
                    y="109"
                    textAnchor="middle"
                    className="service-donut-value"
                  >
                    {total.toLocaleString()}
                  </text>
                  <text
                    x="110"
                    y="137"
                    textAnchor="middle"
                    className="service-donut-label"
                  >
                    NEW TICKETS
                  </text>
                </svg>
              </div>
              <ul className="service-source-legend">
                {segments.map((item) => (
                  <li key={item.label}>
                    <span
                      className="service-dot"
                      style={{ background: item.color }}
                    />
                    <span>{displayLabel(item.label)}</span>
                    <strong>{item.count.toLocaleString()}</strong>
                    <small>{(item.share * 100).toFixed(1)}%</small>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="service-change-track" aria-hidden="true">
                {segments
                  .filter((item) => item.count > 0)
                  .map((item) => (
                    <span
                      key={item.label}
                      style={{
                        width: `${item.share * 100}%`,
                        background: item.color,
                      }}
                    />
                  ))}
              </div>
              <ul className="service-change-legend">
                {segments.map((item) => (
                  <li key={item.label}>
                    <span
                      className="service-dot"
                      style={{ background: item.color }}
                    />
                    <span>{displayLabel(item.label)}</span>
                    <strong>{item.count.toLocaleString()}</strong>
                    <small>{(item.share * 100).toFixed(1)}%</small>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <footer className="service-chart-note">
        {kind === 'sources'
          ? 'Sources of tickets created during the reporting window.'
          : 'Current status of changes raised during the reporting window.'}
      </footer>
    </section>
  );
}
