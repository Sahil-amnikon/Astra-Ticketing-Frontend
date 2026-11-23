export function canReviewChangeRequests(roles: string[]): boolean {
  return roles.some(role => ['TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(role));
}
