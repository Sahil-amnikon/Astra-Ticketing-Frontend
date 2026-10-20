import TicketWorkspace from '../ticket-workspace';

export const metadata = { title: 'Management | ASTRA' };

export default function ManagementPage() {
  return <TicketWorkspace mode="management" view="dashboard" />;
}
