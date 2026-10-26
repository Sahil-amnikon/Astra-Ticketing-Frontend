import TicketWorkspace from '../../../../src/pages/Tickets/TicketWorkspace';

export const metadata = { title: 'Ticket Oversight | ASTRA' };

export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TicketWorkspace mode="admin" view="detail" ticketId={id} />;
}
