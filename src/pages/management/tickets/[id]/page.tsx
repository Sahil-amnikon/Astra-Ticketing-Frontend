import { useParams } from 'react-router-dom';
import TicketWorkspace from '../../../ticket-workspace';

export const metadata = { title: 'Management Ticket | ASTRA' };

export default function ManagementTicketPage() {
  const { id } = useParams() as { id: string };
  return <TicketWorkspace mode="management" view="detail" ticketId={id} />;
}
