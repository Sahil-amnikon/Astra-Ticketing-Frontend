// Fictional UI-review fixtures. Never used by authenticated routes or the API.
export interface Ticket {
  id: string;
  subject: string;
  client: string;
  requester: string;
  assignee: string;
  status: string;
  priority: string;
  sla: string;
  category: string;
  updated: string;
  description: string;
}
export const initialTickets: Ticket[] = [
  {
    id: 'INC-000128',
    subject: 'Unable to connect to the office VPN',
    client: 'Northstar Labs',
    requester: 'Alex Morgan',
    assignee: 'Jamie Carter',
    status: 'In progress',
    priority: 'High',
    sla: 'At risk',
    category: 'Network',
    updated: '5 min ago',
    description:
      'The VPN disconnects after signing in. The connection was working yesterday. Please investigate remote access for the Northstar team.',
  },
  {
    id: 'INC-000127',
    subject: 'New starter · Microsoft 365 access',
    client: 'Acme Studio',
    requester: 'Taylor Reed',
    assignee: 'Riley Chen',
    status: 'Open',
    priority: 'Medium',
    sla: 'On track',
    category: 'Microsoft 365',
    updated: '12 min ago',
    description:
      'Please provision the approved Microsoft 365 applications for the new team member joining on Monday.',
  },
  {
    id: 'INC-000126',
    subject: 'Meeting room display is not detected',
    client: 'Evergreen Co.',
    requester: 'Jordan Lee',
    assignee: 'Jamie Carter',
    status: 'Waiting for client',
    priority: 'Low',
    sla: 'Paused',
    category: 'Hardware',
    updated: '24 min ago',
    description:
      'The display in meeting room 2 is not detected over USB-C. Awaiting confirmation of the laptop model and cable.',
  },
  {
    id: 'INC-000125',
    subject: 'Shared mailbox permissions review',
    client: 'Northstar Labs',
    requester: 'Casey Brooks',
    assignee: 'Riley Chen',
    status: 'New',
    priority: 'Medium',
    sla: 'On track',
    category: 'Microsoft 365',
    updated: '38 min ago',
    description:
      'Review the access list for the support shared mailbox and remove access for former project members.',
  },
  {
    id: 'INC-000124',
    subject: 'Warehouse printer queue is offline',
    client: 'Atlas Supply',
    requester: 'Sam Wilson',
    assignee: 'Morgan Blake',
    status: 'In progress',
    priority: 'Critical',
    sla: 'Breached',
    category: 'Printing',
    updated: '46 min ago',
    description:
      'Shipping labels cannot be printed from the warehouse. The printer is reachable but the print queue remains offline.',
  },
  {
    id: 'INC-000123',
    subject: 'OneDrive sync issue on managed laptop',
    client: 'Acme Studio',
    requester: 'Drew Parker',
    assignee: 'Jamie Carter',
    status: 'Resolved',
    priority: 'Low',
    sla: 'Met',
    category: 'Microsoft 365',
    updated: '1 hour ago',
    description:
      'The sync client was reset and the folder permissions refreshed. The requester confirmed files are syncing.',
  },
  {
    id: 'INC-000122',
    subject: 'Guest Wi-Fi access request',
    client: 'Evergreen Co.',
    requester: 'Avery Ellis',
    assignee: 'Unassigned',
    status: 'New',
    priority: 'Low',
    sla: 'On track',
    category: 'Network',
    updated: '2 hours ago',
    description:
      'Provide time-limited guest network access for the upcoming partner workshop.',
  },
  {
    id: 'INC-000121',
    subject: 'Endpoint security agent update',
    client: 'Atlas Supply',
    requester: 'Sam Wilson',
    assignee: 'Morgan Blake',
    status: 'Open',
    priority: 'High',
    sla: 'On track',
    category: 'Security',
    updated: '3 hours ago',
    description:
      'The security agent update is pending on three devices. Investigate the update policy and schedule a retry.',
  },
];
export const trend = [
  [6, 4],
  [9, 5],
  [7, 6],
  [12, 9],
  [10, 8],
  [5, 6],
  [4, 5],
  [11, 8],
  [14, 11],
  [9, 10],
  [13, 9],
  [16, 12],
  [12, 11],
  [10, 8],
].map(([created, resolved], i) => ({
  day: `2026-10-${String(i + 7).padStart(2, '0')}`,
  created,
  resolved,
}));
export const statuses = [
  'New',
  'Open',
  'In progress',
  'Waiting for client',
  'Resolved',
  'Closed',
];
export const priorities = ['Low', 'Medium', 'High', 'Critical'];
export const people = [
  'Unassigned',
  'Jamie Carter',
  'Riley Chen',
  'Morgan Blake',
];
export const clients = [
  'Northstar Labs',
  'Acme Studio',
  'Evergreen Co.',
  'Atlas Supply',
];
export type ModuleId =
  | 'dashboard'
  | 'tickets'
  | 'team'
  | 'internal'
  | 'changes'
  | 'problems'
  | 'knowledge'
  | 'catalogue'
  | 'clients'
  | 'contacts'
  | 'sites'
  | 'assets'
  | 'reports'
  | 'sla'
  | 'users'
  | 'groups'
  | 'categories'
  | 'email'
  | 'audit'
  | 'service-admin'
  | 'cab'
  | 'client'
  | 'support'
  | 'help'
  | 'login';
export const moduleTitles: Record<ModuleId, string> = {
  dashboard: 'My service desk',
  tickets: 'All tickets',
  team: 'Team tickets',
  internal: 'Internal tickets',
  changes: 'Change Management',
  problems: 'Problem Management',
  knowledge: 'Knowledge base',
  catalogue: 'Service catalogue',
  clients: 'Clients',
  contacts: 'Contacts',
  sites: 'Sites',
  assets: 'Assets',
  reports: 'Service performance',
  sla: 'SLA policies',
  users: 'Users & access',
  groups: 'Groups',
  categories: 'Categories & tags',
  email: 'Email administration',
  audit: 'Audit history',
  'service-admin': 'Service administration',
  cab: 'CAB & change policy',
  client: 'Client portal',
  support: 'Request support',
  help: 'Help & user guide',
  login: 'Sign-in screen',
};
export function statusTone(value: string) {
  if (/breach|critical|rejected|offline/i.test(value)) return 'red';
  if (/risk|waiting|high|pending|review/i.test(value)) return 'amber';
  if (/progress|new|open|medium|planned/i.test(value)) return 'blue';
  if (/paused|draft/i.test(value)) return 'purple';
  return 'green';
}
export interface RecordItem {
  id: string;
  name: string;
  detail: string;
  extra: string;
  status: string;
}
export const records: Partial<
  Record<
    ModuleId,
    {
      description: string;
      singular: string;
      columns: [string, string, string];
      rows: RecordItem[];
    }
  >
> = {
  clients: {
    description: 'Manage your customers and their service relationships.',
    singular: 'client',
    columns: ['Client', 'Primary contact', 'Service plan'],
    rows: clients.map((name, i) => ({
      id: `CL-${i + 1}`,
      name,
      detail: ['Alex Morgan', 'Taylor Reed', 'Jordan Lee', 'Sam Wilson'][i],
      extra: ['Business Plus', 'Business', 'Standard', 'Business Plus'][i],
      status: 'Active',
    })),
  },
  contacts: {
    description:
      'Keep customer contacts and requesters connected to the right client.',
    singular: 'contact',
    columns: ['Contact', 'Email address', 'Client'],
    rows: initialTickets
      .slice(0, 5)
      .map((t, i) => ({
        id: `CO-${i + 1}`,
        name: t.requester,
        detail: t.requester.toLowerCase().replace(' ', '.') + '@example.com',
        extra: t.client,
        status: 'Active',
      })),
  },
  sites: {
    description: 'Organize customer locations and service coverage.',
    singular: 'site',
    columns: ['Site', 'Location', 'Client'],
    rows: clients.map((name, i) => ({
      id: `SI-${i + 1}`,
      name: ['Headquarters', 'Design studio', 'Main office', 'Warehouse'][i],
      detail: ['Bengaluru', 'Chennai', 'Hyderabad', 'Pune'][i],
      extra: name,
      status: 'Active',
    })),
  },
  assets: {
    description: 'Track the devices and services your team supports.',
    singular: 'asset',
    columns: ['Asset', 'Type', 'Client'],
    rows: [
      {
        id: 'AS-001',
        name: 'NS-LAPTOP-014',
        detail: 'Managed laptop',
        extra: 'Northstar Labs',
        status: 'Active',
      },
      {
        id: 'AS-002',
        name: 'AC-STUDIO-006',
        detail: 'Workstation',
        extra: 'Acme Studio',
        status: 'Active',
      },
      {
        id: 'AS-003',
        name: 'AT-PRINT-002',
        detail: 'Network printer',
        extra: 'Atlas Supply',
        status: 'Offline',
      },
    ],
  },
  users: {
    description: 'Manage approved staff profiles, workspace roles, and access.',
    singular: 'user',
    columns: ['Team member', 'Email address', 'Role'],
    rows: people
      .slice(1)
      .map((name, i) => ({
        id: `US-${i + 1}`,
        name,
        detail: name.toLowerCase().replace(' ', '.') + '@example.com',
        extra: ['Technician', 'Team lead', 'Administrator'][i],
        status: 'Active',
      })),
  },
  groups: {
    description: 'Organize staff teams and customer service groups.',
    singular: 'group',
    columns: ['Group', 'Purpose', 'Members'],
    rows: [
      {
        id: 'GR-001',
        name: 'Service desk',
        detail: 'First-line customer support',
        extra: '8 members',
        status: 'Active',
      },
      {
        id: 'GR-002',
        name: 'Infrastructure',
        detail: 'Network and server operations',
        extra: '4 members',
        status: 'Active',
      },
      {
        id: 'GR-003',
        name: 'Customer success',
        detail: 'Service reviews and escalation',
        extra: '3 members',
        status: 'Active',
      },
    ],
  },
  sla: {
    description: 'Define response and resolution commitments for your clients.',
    singular: 'SLA policy',
    columns: ['Policy', 'Response target', 'Resolution target'],
    rows: [
      {
        id: 'SLA-001',
        name: 'Business Plus',
        detail: '30 minutes',
        extra: '4 business hours',
        status: 'Active',
      },
      {
        id: 'SLA-002',
        name: 'Business',
        detail: '1 business hour',
        extra: '8 business hours',
        status: 'Active',
      },
      {
        id: 'SLA-003',
        name: 'Standard',
        detail: '4 business hours',
        extra: '2 business days',
        status: 'Active',
      },
    ],
  },
  categories: {
    description:
      'Maintain consistent service categories and searchable ticket tags.',
    singular: 'category',
    columns: ['Category', 'Description', 'Tags'],
    rows: [
      {
        id: 'CAT-001',
        name: 'Microsoft 365',
        detail: 'Productivity and collaboration',
        extra: 'Outlook · Teams · OneDrive',
        status: 'Active',
      },
      {
        id: 'CAT-002',
        name: 'Network',
        detail: 'Connectivity and remote access',
        extra: 'VPN · Wi-Fi · Firewall',
        status: 'Active',
      },
      {
        id: 'CAT-003',
        name: 'Hardware',
        detail: 'Devices and peripherals',
        extra: 'Laptop · Printer · Monitor',
        status: 'Active',
      },
    ],
  },
  email: {
    description: 'Manage service mailboxes and inbound ticket routing.',
    singular: 'mailbox',
    columns: ['Mailbox', 'Address', 'Routing'],
    rows: [
      {
        id: 'MAIL-001',
        name: 'Service desk',
        detail: 'support@example.com',
        extra: 'Create service tickets',
        status: 'Active',
      },
      {
        id: 'MAIL-002',
        name: 'Change requests',
        detail: 'changes@example.com',
        extra: 'Change Management',
        status: 'Pending review',
      },
    ],
  },
  'service-admin': {
    description: 'Configure service offerings, ownership, and request routing.',
    singular: 'service',
    columns: ['Service', 'Owner', 'Category'],
    rows: [
      {
        id: 'SV-001',
        name: 'User onboarding',
        detail: 'Service desk',
        extra: 'Identity & access',
        status: 'Active',
      },
      {
        id: 'SV-002',
        name: 'Device support',
        detail: 'Infrastructure',
        extra: 'Hardware',
        status: 'Active',
      },
      {
        id: 'SV-003',
        name: 'Application access',
        detail: 'Service desk',
        extra: 'Microsoft 365',
        status: 'Active',
      },
    ],
  },
  cab: {
    description: 'Review change approval boards and governance policies.',
    singular: 'policy',
    columns: ['Policy', 'Approval board', 'Requirement'],
    rows: [
      {
        id: 'CAB-001',
        name: 'Normal change policy',
        detail: 'Weekly CAB',
        extra: '2 approvers',
        status: 'Active',
      },
      {
        id: 'CAB-002',
        name: 'Emergency change policy',
        detail: 'Emergency CAB',
        extra: '1 approver',
        status: 'Active',
      },
    ],
  },
  audit: {
    description:
      'A read-only record of service-desk activity and administrative changes.',
    singular: 'event',
    columns: ['Event', 'Actor', 'Reference'],
    rows: [
      {
        id: 'AUD-001',
        name: 'Ticket assigned',
        detail: 'Riley Chen',
        extra: 'INC-000128 · 09:42',
        status: 'Recorded',
      },
      {
        id: 'AUD-002',
        name: 'SLA policy updated',
        detail: 'Morgan Blake',
        extra: 'Business Plus · 09:18',
        status: 'Recorded',
      },
      {
        id: 'AUD-003',
        name: 'Internal note added',
        detail: 'Jamie Carter',
        extra: 'INC-000124 · 08:56',
        status: 'Recorded',
      },
      {
        id: 'AUD-004',
        name: 'Contact created',
        detail: 'Riley Chen',
        extra: 'Northstar Labs · 08:31',
        status: 'Recorded',
      },
    ],
  },
};
export const changes: RecordItem[] = [
  {
    id: 'CHG-000032',
    name: 'Firewall firmware upgrade',
    detail: 'Northstar Labs',
    extra: 'Normal · 24 Oct, 22:00',
    status: 'Pending review',
  },
  {
    id: 'CHG-000031',
    name: 'Microsoft 365 retention policy',
    detail: 'Acme Studio',
    extra: 'Standard · 23 Oct, 18:00',
    status: 'Planned',
  },
  {
    id: 'CHG-000030',
    name: 'Warehouse switch replacement',
    detail: 'Atlas Supply',
    extra: 'Normal · 22 Oct, 20:00',
    status: 'Approved',
  },
  {
    id: 'CHG-000029',
    name: 'Endpoint security baseline update',
    detail: 'Evergreen Co.',
    extra: 'Standard · 21 Oct, 19:00',
    status: 'Completed',
  },
];
export const problems: RecordItem[] = [
  {
    id: 'PRB-000018',
    name: 'Recurring VPN session disconnects',
    detail: 'Network · 4 linked incidents',
    extra: 'Jamie Carter',
    status: 'Investigating',
  },
  {
    id: 'PRB-000017',
    name: 'Intermittent print spooler failures',
    detail: 'Printing · 3 linked incidents',
    extra: 'Morgan Blake',
    status: 'Known error',
  },
  {
    id: 'PRB-000016',
    name: 'OneDrive sync after profile migration',
    detail: 'Microsoft 365 · 2 linked incidents',
    extra: 'Riley Chen',
    status: 'Resolved',
  },
];
