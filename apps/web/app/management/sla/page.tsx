import AdminInsights from '../../admin/admin-insights';

export const metadata = { title: 'SLA Management | ASTRA' };

export default function ManagementSlaPage() {
  return <AdminInsights section="sla" workspace="management" />;
}
