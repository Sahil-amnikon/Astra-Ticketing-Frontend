import type { IconName } from '../components/ui/UiIcon';

export type NavigationLink = [string, IconName, string];

// Preserve the existing extension permissions; grouping never grants access.
export function extensionLinks(user?: {
  roles: string[];
  permissions?: string[];
}): NavigationLink[] {
  if (!user) return [];
  const links: NavigationLink[] = [
    ['/knowledge', 'categories', 'Knowledge base'],
    ['/catalogue', 'grid', 'Service catalogue'],
  ];
  if (
    user.roles.some((r) =>
      ['TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
    )
  )
    links.unshift(['/problems', 'change', 'Problem Management']);
  if (user.roles.includes('ADMIN'))
    links.push(
      ['/admin/service-management', 'grid', 'Service administration'],
      ['/admin/groups', 'team', 'Groups'],
      ['/admin/change-governance', 'team', 'CAB & change policy'],
      ['/admin/email', 'contacts', 'Email administration'],
      ['/admin/client-domains', 'clients', 'Client support portal'],
    );
  if (
    user.roles.includes('ADMIN') ||
    user.permissions?.includes('REPORTS_VIEW')
  )
    links.push(['/service-reports', 'reports', 'Service performance']);
  links.push(['/help', 'grid', 'User guide']);
  return links;
}

const groups = [
  'Workspace',
  'Service delivery',
  'Customers',
  'Management',
  'Administration',
  'Help',
];

export function groupNavigation(links: NavigationLink[]) {
  const groupFor = ([href, icon]: NavigationLink) => {
    if (href === '/help') return 'Help';
    if (href === '/admin/groups') return 'Customers';
    if (
      ['clients', 'contacts', 'sites'].includes(icon) &&
      href !== '/admin/email'
    )
      return 'Customers';
    if (['reports', 'sla'].includes(icon)) return 'Management';
    if (
      ['users', 'audit', 'tags'].includes(icon) ||
      href === '/admin/email' ||
      href === '/admin/categories' ||
      href === '/admin/service-management'
    )
      return 'Administration';
    if (
      [
        '/knowledge',
        '/catalogue',
        '/changes',
        '/problems',
        '/admin/change-governance',
      ].includes(href)
    )
      return 'Service delivery';
    return 'Workspace';
  };
  return groups
    .map((label) => ({
      label,
      links: links.filter((link) => groupFor(link) === label),
    }))
    .filter((group) => group.links.length);
}

// These are the only URL shortcuts introduced by this release. Existing filters
// and server-side scope checks remain authoritative.
export function dashboardQueueFilters(search: string) {
  const params = new URLSearchParams(search);
  const result: {
    status?: string;
    slaStatus?: string;
    dashboardFilter?: string;
    clientId?: string;
    siteId?: string;
  } = {};
  for (const key of ['clientId', 'siteId'] as const) {
    const value = params.get(key);
    if (
      value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    )
      result[key] = value;
  }
  const metric = params.get('dashboardFilter');
  if (metric && Object.hasOwn(dashboardFilterLabels, metric))
    result.dashboardFilter = metric;
  const status = params.get('status');
  const slaStatus = params.get('slaStatus');
  if (
    status &&
    [
      'NEW',
      'OPEN',
      'IN_PROGRESS',
      'WAITING_FOR_CLIENT',
      'WAITING_FOR_VENDOR',
      'ON_HOLD',
      'RESOLVED',
      'CLOSED',
      'CANCELLED',
    ].includes(status)
  )
    result.status = status;
  if (
    slaStatus &&
    [
      'ON_TRACK',
      'AT_RISK',
      'BREACHED',
      'PAUSED',
      'MET',
      'NOT_TRACKED',
    ].includes(slaStatus)
  )
    result.slaStatus = slaStatus;
  return result;
}

export const dashboardFilterLabels: Record<string, string> = {
  WAITING: 'Waiting for client or vendor',
  RESOLVED_RECENTLY: 'Resolved in the last 7 days',
  AWAITING_FIRST_RESPONSE: 'Awaiting first response (30+ business minutes)',
  PENDING_APPROVAL: 'Pending approval',
};
