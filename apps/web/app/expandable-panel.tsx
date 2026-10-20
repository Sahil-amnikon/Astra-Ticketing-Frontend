import type { ReactNode } from 'react';
export default function ExpandablePanel({
  title,
  children,
  className = '',
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className={`panel expandable-panel ${className}`}
      open={defaultOpen}
    >
      <summary>
        <span className="expandable-title">{title}</span>
        <span className="expandable-chevron" aria-hidden="true" />
      </summary>
      <div className="expandable-body">{children}</div>
    </details>
  );
}
