import TicketWorkspace from '../../../../src/pages/Tickets/TicketWorkspace';

export const metadata = { title: 'Ticket | ASTRA' };

export default async function TechnicianTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TicketWorkspace mode="technician" view="detail" ticketId={id} />;
}
