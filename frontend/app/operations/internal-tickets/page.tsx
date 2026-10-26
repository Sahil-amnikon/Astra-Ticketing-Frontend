import TicketWorkspace from '../../../src/pages/Tickets/TicketWorkspace';
export default function Page() {
  return (
    <TicketWorkspace mode="technician" view="list" ticketScope="internal" />
  );
}
