import TicketWorkspace from '../../ticket-workspace';

export const metadata = { title: 'Site Team Tickets | ASTRA' };

export default function SiteTeamTicketsPage() {
  return <TicketWorkspace mode="technician" view="list" ticketScope="team" />;
}
