import AdminInsights from '../../../src/Admin/admin-insights';

export const metadata = { title: 'Management Reports | ASTRA' };

export default function ManagementReportsPage() {
  return <AdminInsights section="reports" workspace="management" />;
}
