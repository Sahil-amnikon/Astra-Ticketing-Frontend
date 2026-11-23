import { useParams } from 'react-router-dom';
import TicketWorkspace from '../../../ticket-workspace';

export const metadata = { title: 'Ticket Oversight | ASTRA' };

export default function AdminTicketPage() {
  const { id } = useParams() as { id: string };
  return <TicketWorkspace mode="admin" view="detail" ticketId={id} />;
}
