import TicketWorkspace from '../../../src/pages/Tickets/TicketWorkspace';

export const metadata = { title: 'My Tickets | ASTRA' };

export default function MyTicketsPage() {
  return <TicketWorkspace mode="technician" view="list" />;
}
