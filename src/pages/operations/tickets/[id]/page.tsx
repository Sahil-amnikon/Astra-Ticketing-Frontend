import { useParams } from 'react-router-dom';
import TicketWorkspace from '../../../ticket-workspace';

export const metadata = { title: 'Ticket | ASTRA' };

export default function TechnicianTicketPage() {
  const { id } = useParams() as { id: string };
  return <TicketWorkspace mode="technician" view="detail" ticketId={id} />;
}
