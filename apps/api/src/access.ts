export const PERMISSION_CODES = [
  'TICKETS_TEAM_VIEW',
  'TICKETS_ASSIGN',
  'TICKETS_APPROVE',
  'CATEGORY_MANAGE',
  'SLA_MANAGE',
  'REPORTS_VIEW',
  'USERS_MANAGE',
  'CLIENTS_MANAGE',
  'CONTACTS_MANAGE',
  'SITES_MANAGE',
  'TAGS_MANAGE',
  'AUDIT_VIEW',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const ROLE_PERMISSION_PRESETS: Record<string, PermissionCode[]> = {
  USER: [],
  INTERN: [],
  TECHNICIAN: ['TICKETS_TEAM_VIEW', 'TICKETS_ASSIGN'],
  TEAM_LEAD: [
    'TICKETS_TEAM_VIEW',
    'TICKETS_ASSIGN',
    'CATEGORY_MANAGE',
    'TAGS_MANAGE',
    'REPORTS_VIEW',
  ],
  MANAGER: [
    'TICKETS_TEAM_VIEW',
    'TICKETS_ASSIGN',
    'TICKETS_APPROVE',
    'CATEGORY_MANAGE',
    'TAGS_MANAGE',
    'SLA_MANAGE',
    'REPORTS_VIEW',
    'AUDIT_VIEW',
  ],
  ADMIN: [],
};

export function permissionsForRoles(roles: string[]): PermissionCode[] {
  return [
    ...new Set(roles.flatMap((role) => ROLE_PERMISSION_PRESETS[role] ?? [])),
  ];
}
