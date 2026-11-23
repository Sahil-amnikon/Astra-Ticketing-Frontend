import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'dashboard'
  | 'tickets'
  | 'team'
  | 'change'
  | 'sla'
  | 'reports'
  | 'users'
  | 'clients'
  | 'contacts'
  | 'sites'
  | 'categories'
  | 'tags'
  | 'audit'
  | 'search'
  | 'grid'
  | 'clock'
  | 'waiting'
  | 'check'
  | 'alert'
  | 'pulse'
  | 'switch';

const paths: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  tickets: (
    <>
      <path d="M5 4h14a2 2 0 0 1 2 2v3a3 3 0 0 0 0 6v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 1 2-2Z" />
      <path d="M13 6v2M13 11v2M13 16v2" />
    </>
  ),
  team: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="7" r="2.5" />
      <path d="M3 20v-2a5 5 0 0 1 10 0v2M14 13a5 5 0 0 1 7 4.6V20" />
    </>
  ),
  change: (
    <>
      <path d="M4 8a8 8 0 0 1 14-3l2 3" />
      <path d="M20 3v5h-5M20 16a8 8 0 0 1-14 3l-2-3" />
      <path d="M4 21v-5h5" />
    </>
  ),
  sla: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  users: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  clients: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M17 9h3a1 1 0 0 1 1 1v11M8 7h2M8 11h2M8 15h2M14 7h.01M14 11h.01M14 15h.01M2 21h20" />
    </>
  ),
  contacts: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2.5" />
      <path d="M5.5 17a3.5 3.5 0 0 1 7 0M15 9h3M15 13h3" />
    </>
  ),
  sites: (
    <>
      <path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01" />
    </>
  ),
  categories: (
    <>
      <path d="m12 3 4 4-4 4-4-4 4-4ZM6 13l4 4-4 4-4-4 4-4ZM18 13l4 4-4 4-4-4 4-4Z" />
    </>
  ),
  tags: (
    <>
      <path d="M20 13 12 21 3 12V3h9l8 8a1.4 1.4 0 0 1 0 2Z" />
      <circle cx="8" cy="8" r="1.5" />
    </>
  ),
  audit: (
    <>
      <path d="M12 8v5l3 2M5 5a9 9 0 1 1-2 9" />
      <path d="M3 5v5h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  grid: (
    <>
      <path d="M4 5h16M4 12h16M4 19h16" />
      <path d="M8 3v18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5H7" />
    </>
  ),
  waiting: (
    <>
      <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" />
    </>
  ),
  check: <path d="m5 13 4 4L19 7" />,
  alert: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  pulse: (
    <>
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </>
  ),
  switch: (
    <>
      <path d="M7 7h11l-3-3M17 17H6l3 3" />
    </>
  ),
};

export default function UiIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      data-icon={name}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
