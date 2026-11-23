import TicketWorkspace from '../../ticket-workspace';
export default function Page() {
  return (
    <TicketWorkspace mode="technician" view="list" ticketScope="internal" />
  );
}
