import { notFound } from 'next/navigation';
import AdminConsole from '../../../src/Admin/admin-console';
import TicketWorkspace from '../../../src/pages/Tickets/TicketWorkspace';
import AdminInsights from '../../../src/Admin/admin-insights';
export default async function AdminSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
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
