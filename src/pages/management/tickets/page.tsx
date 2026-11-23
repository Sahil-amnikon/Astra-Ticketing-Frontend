import TicketWorkspace from '../../ticket-workspace';
export const metadata = { title: 'Team Tickets | ASTRA' };
export default function Page() {
  return <TicketWorkspace mode="management" view="list" />;
}
