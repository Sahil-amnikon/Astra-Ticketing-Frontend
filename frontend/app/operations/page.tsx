import TicketWorkspace from '../../src/pages/Tickets/TicketWorkspace';

export const metadata = { title: 'Technician Portal | ASTRA' };

export default function OperationsPortalPage() {
  return <TicketWorkspace mode="technician" view="dashboard" />;
}
