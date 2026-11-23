export type ChangeReviewFilter = { status: string; q: string; clientId: string; from: string; to: string };
export const defaultChangeReviewFilter: ChangeReviewFilter = { status: 'PENDING', q: '', clientId: '', from: '', to: '' };

export function changeReviewQuery(filter: ChangeReviewFilter, page: number): string {
  const query = new URLSearchParams({ status: filter.status, page: String(page), pageSize: '20' });
  if (filter.q.trim()) query.set('q', filter.q.trim());
  if (filter.clientId) query.set('clientId', filter.clientId);
  const start = filter.from ? new Date(`${filter.from}T00:00:00`) : undefined;
  const end = filter.to ? new Date(`${filter.to}T00:00:00`) : undefined;
  if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime()))) throw Error('Choose valid submitted dates.');
  if (end) end.setDate(end.getDate() + 1);
  if (start && end && end <= start) throw Error('The end date must be on or after the start date.');
  if (start) query.set('from', start.toISOString());
  if (end) query.set('to', end.toISOString());
  return query.toString();
}
