export const planTextFields = [
  ['impact', 'Impact assessment'], ['reason', 'Reason for change'], ['businessJustification', 'Business justification'],
  ['implementationPlan', 'Implementation plan'], ['testPlan', 'Testing and validation plan'], ['rollbackPlan', 'Rollback plan'], ['communicationPlan', 'Communication plan'],
] as const;
export type ChangePlanData = {
  title: string; description: string; category: string; changeType: string; risk: string; downtimeMinutes: number;
  outageExpected: boolean; clientNotificationEnabled: boolean; plannedStart?: string | null; plannedEnd?: string | null;
  impact: string; reason: string; businessJustification: string; implementationPlan: string; testPlan: string; rollbackPlan: string; communicationPlan: string;
};
export type TemplateApproval = { requested_by_name?: string | null; approved_by_name?: string | null; approval_required?: boolean | number };
export type SavedChangePlan = TemplateApproval & { id: string; name: string; plan: ChangePlanData | string };
export function templateApprovalNames(template?: TemplateApproval) {
  return {
    requestedBy: template?.requested_by_name || 'Not recorded',
    approvedBy: template?.approved_by_name || (template?.approval_required === false || template?.approval_required === 0 ? 'Not required — saved directly' : 'Not recorded'),
  };
}
export const canSaveChangePlanDirectly = (roles: string[]) => roles.some(role => ['TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(role));
export const canCreateChangePlan = (roles: string[]) => roles.some(role => ['TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(role));
export function localPlanTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function changePlanFromForm(form: FormData): ChangePlanData {
  const text = (name: string) => String(form.get(name) ?? '').trim();
  const time = (name: string) => text(name) ? new Date(text(name)).toISOString() : undefined;
  return {
    title: text('title'), description: text('description'), category: text('category'), changeType: text('changeType'), risk: text('risk'),
    downtimeMinutes: Number(text('downtimeMinutes') || 0), outageExpected: text('outageExpected') === 'true', clientNotificationEnabled: text('clientNotificationEnabled') === 'true',
    plannedStart: time('plannedStart'), plannedEnd: time('plannedEnd'),
    impact: text('impact'), reason: text('reason'), businessJustification: text('businessJustification'), implementationPlan: text('implementationPlan'), testPlan: text('testPlan'), rollbackPlan: text('rollbackPlan'), communicationPlan: text('communicationPlan'),
  };
}
export function changePlanControlValues(plan: Partial<ChangePlanData>): Record<string, string> {
  const values: Record<string,string> = {};
  for (const name of ['title','description','category','changeType','risk',...planTextFields.map(([name]) => name)] as const)
    if (typeof plan[name] === 'string') values[name] = plan[name];
  if (typeof plan.downtimeMinutes === 'number') values.downtimeMinutes = String(plan.downtimeMinutes);
  if (typeof plan.outageExpected === 'boolean') values.outageExpected = String(plan.outageExpected);
  if (typeof plan.clientNotificationEnabled === 'boolean') values.clientNotificationEnabled = String(plan.clientNotificationEnabled);
  if ('plannedStart' in plan) values.plannedStart = localPlanTime(plan.plannedStart);
  if ('plannedEnd' in plan) values.plannedEnd = localPlanTime(plan.plannedEnd);
  return values;
}
export function applyChangePlanToForm(form: HTMLFormElement, plan: Partial<ChangePlanData>) {
  for (const [name, value] of Object.entries(changePlanControlValues(plan))) {
    const control = form.elements.namedItem(name);
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}
