import TicketWorkspace from '../../ticket-workspace';

export const metadata = { title: 'My Tickets | ASTRA' };

export default function MyTicketsPage() {
  return <TicketWorkspace mode="technician" view="list" />;
}
