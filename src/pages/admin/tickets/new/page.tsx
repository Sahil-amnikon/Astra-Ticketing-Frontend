import TicketWorkspace from '../../../ticket-workspace';
export const metadata = { title: 'New Ticket | ASTRA' };
export default function Page() {
  return <TicketWorkspace mode="admin" view="new" />;
}
