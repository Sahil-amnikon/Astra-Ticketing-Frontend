import TicketWorkspace from '../../../src/pages/Tickets/TicketWorkspace';

export const metadata = { title: 'New Ticket | ASTRA' };

export default function NewTicketPage() {
  return <TicketWorkspace mode="technician" view="new" />;
}
