export const STAFF_GROUP_PERMISSIONS = [
  'TICKETS_TEAM_VIEW',
  'TICKETS_ASSIGN',
  'TICKETS_APPROVE',
  'CATEGORY_MANAGE',
  'SLA_MANAGE',
  'REPORTS_VIEW',
  'TAGS_MANAGE',
];
export const CUSTOMER_GROUP_PERMISSIONS = [
  'PORTAL_ORGANIZATION_VIEW',
  'PORTAL_ORGANIZATION_REPLY',
];

export function portalGroupAccess(
  permission: 'PORTAL_ORGANIZATION_VIEW' | 'PORTAL_ORGANIZATION_REPLY',
) {
  return `EXISTS(SELECT 1 FROM customer_group_members gm JOIN access_groups g ON g.id=gm.group_id
    JOIN contacts member ON member.id=gm.contact_id JOIN users member_user ON member_user.id=member.user_id
    WHERE member.user_id=$1 AND member.active AND member_user.active AND g.kind='CUSTOMER' AND g.active
      AND gm.client_id=t.client_id AND g.client_id=t.client_id AND '${permission}'=ANY(g.permissions))`;
}
