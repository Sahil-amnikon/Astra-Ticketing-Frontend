import TicketWorkspace from '../../src/pages/Tickets/TicketWorkspace';

export const metadata = { title: 'Management | ASTRA' };

export default function ManagementPage() {
  return <TicketWorkspace mode="management" view="dashboard" />;
}
