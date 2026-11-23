import { formatApiDate, parseApiTimestamp } from './api-time';
import './ticket-information.css';

type Row = Record<string, unknown>;
function statusValue(raw: unknown): string {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { /* Older events contain plain status text. */ }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Row;
    value = row.status ?? row.newStatus ?? row.value;
  }
  return typeof value === 'string' ? value.toUpperCase() : '';
}

export function lastTicketResolution(history: Row[]): Row | undefined {
  // Use the resolution event's actor, never the current assignee or QA reviewer.
  return history.filter(event => event.action === 'TICKET.STATUS_CHANGED' && statusValue(event.new_value) === 'RESOLVED')
    .reduce<Row | undefined>((latest, event) => !latest ||
      (parseApiTimestamp(event.created_at)?.getTime() ?? 0) >= (parseApiTimestamp(latest.created_at)?.getTime() ?? 0)
        ? event : latest, undefined);
}

const text = (value: unknown, fallback = 'Not recorded') => value == null || value === '' ? fallback : String(value);
const label = (value: unknown) => text(value).split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');

export default function TicketInformation({ ticket, history }: { ticket: Row; history: Row[] }) {
  const resolution = lastTicketResolution(history);
  const internal = ticket.client_id === '00000000-0000-4000-8000-000000000132';
  const additionalUsers = Array.isArray(ticket.additional_requesters) ? ticket.additional_requesters as Row[] : [];
  const users = [{ name: ticket.requester_name, email: ticket.requester_email }, ...additionalUsers];
  const categories=Array.isArray(ticket.categories)?ticket.categories as Row[]:[];
  const facts = [
    ['MSP', text(ticket.client_name)],
    ['Client', text(ticket.site_name, internal ? 'Internal request' : 'Not specified')],
    [users.length > 1 ? 'User names' : 'User name', users.map(user => text(user.name)).join(', ')],
    [users.length > 1 ? 'User emails' : 'User email', users.map(user => text(user.email)).join(', ')],
    ['Status', label(ticket.status)],
    ['Priority', label(ticket.priority)],
    ['Assigned to', text(ticket.assigned_name, 'Unassigned')],
    ['Last resolved by', text(resolution?.actor_name ?? ticket.resolved_by_name, resolution || ['RESOLVED', 'CLOSED'].includes(String(ticket.status)) ? 'Not recorded' : 'Not resolved')],
    ['Created', formatApiDate(ticket.created_at)],
    ['Last resolved', formatApiDate(resolution?.created_at ?? ticket.resolved_at)],
    [categories.length>1?'Categories':'Category',categories.length?categories.map(category=>text(category.name)).join(', '):text(ticket.category_name)],
    ['SLA', label(ticket.sla_status)],
  ];
  return <section className="panel ticket-information" aria-labelledby="ticket-information-title">
    <h2 id="ticket-information-title">Ticket information</h2>
    <dl className="ticket-information-grid">{facts.map(([name, value]) => <div key={name}>
      <dt>{name}</dt><dd>{value}</dd>
    </div>)}</dl>
  </section>;
}
