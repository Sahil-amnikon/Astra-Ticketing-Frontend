import TicketWorkspace from '../../../src/pages/Tickets/TicketWorkspace';

export const metadata = { title: 'Site Team Tickets | ASTRA' };

export default function SiteTeamTicketsPage() {
  return <TicketWorkspace mode="technician" view="list" ticketScope="team" />;
}
