import TicketWorkspace from '../../../../src/pages/Tickets/TicketWorkspace';

export const metadata = { title: 'Management Ticket | ASTRA' };

export default async function ManagementTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TicketWorkspace mode="management" view="detail" ticketId={id} />;
}
