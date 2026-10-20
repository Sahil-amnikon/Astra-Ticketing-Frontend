export const DASHBOARD_FILTERS = [
  'WAITING',
  'RESOLVED_RECENTLY',
  'AWAITING_FIRST_RESPONSE',
  'PENDING_APPROVAL',
] as const;
export function dashboardPredicates(slaAlias: 's' | 'sla') {
  return {
    WAITING: "t.status IN ('WAITING_FOR_CLIENT','WAITING_FOR_VENDOR')",
    RESOLVED_RECENTLY:
      "t.status='RESOLVED' AND t.resolved_at >= now() - interval '7 days'",
    AWAITING_FIRST_RESPONSE: `t.status NOT IN ('RESOLVED','CLOSED','CANCELLED') AND t.first_response_at IS NULL AND ${slaAlias}.paused_at IS NULL AND sla_business_minutes_between(${slaAlias}.calendar_id,t.created_at,now()) >= 30`,
    PENDING_APPROVAL: "t.approval_status='PENDING'",
  };
}
