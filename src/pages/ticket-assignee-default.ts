type Technician = { id: string; displayName: string };
type Row = Record<string, unknown>;

export function initialTicketTechnician(existing: unknown, currentUserId: string): string {
  return typeof existing === 'string' && existing.trim() ? existing : currentUserId;
}

export function technicianOptions(items: Row[], current: Technician, existing?: { id: string; name: string }): Row[] {
  const options = items.some(item => item.id === current.id)
    ? items : [{ id: current.id, name: current.displayName }, ...items];
  return existing?.id && !options.some(item => item.id === existing.id)
    ? [{ id: existing.id, name: existing.name }, ...options] : options;
}
