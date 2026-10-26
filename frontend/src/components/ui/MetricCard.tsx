import type { ReactNode } from 'react';
import Link from 'next/link';

export default function MetricCard({
  label,
  value,
  icon,
  tone = 'blue',
  href,
  detail,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: string;
  href?: string;
  detail?: string;
}) {
  const content = (
    <>
      <span className={`corporate-metric-icon ${tone}`}>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {detail && <span className="spark-metric-detail">{detail}</span>}
      </div>
      {href && (
        <span className="corporate-metric-arrow" aria-hidden="true">
          ↗
        </span>
      )}
    </>
  );
  return href ? (
    <Link
      href={href}
      className={`corporate-metric spark-metric-${tone}`}
      aria-label={`${label}: ${value}`}
    >
      {content}
    </Link>
  ) : (
    <article className={`corporate-metric spark-metric-${tone}`}>
      {content}
    </article>
  );
}
