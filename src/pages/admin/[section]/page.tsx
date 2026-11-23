import { useParams } from 'react-router-dom';
import { notFound } from '../../../navigation/hooks';
import AdminConsole from '../admin-console';
import TicketWorkspace from '../../ticket-workspace';
import AdminInsights from '../admin-insights';
export default function AdminSection() {
  const { section } = useParams() as { section: string };
  if (
    ![
      'users',
      'tickets',
      'sla',
      'reports',
      'clients',
      'contacts',
      'sites',
      'assets',
      'categories',
      'tags',
      'audit-logs',
    ].includes(section)
  )
    notFound();
  if (section === 'tickets')
    return <TicketWorkspace mode="admin" view="list" />;
  if (section === 'sla' || section === 'reports')
    return <AdminInsights section={section} />;
  return <AdminConsole key={section} section={section} />;
}
