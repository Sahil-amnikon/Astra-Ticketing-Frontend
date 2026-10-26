import type { IconName } from '../components/ui/UiIcon';
import type { ModuleId } from '../pages/Preview/data/fixtures';

export const previewNavigation: {
  label: string;
  links: [ModuleId, IconName, string][];
}[] = [
  {
    label: 'Workspace',
    links: [
      ['dashboard', 'dashboard', 'Dashboard'],
      ['tickets', 'tickets', 'All tickets'],
      ['team', 'team', 'Team tickets'],
      ['internal', 'grid', 'Internal tickets'],
    ],
  },
  {
    label: 'Service delivery',
    links: [
      ['changes', 'change', 'Change Management'],
      ['problems', 'pulse', 'Problem Management'],
      ['knowledge', 'categories', 'Knowledge base'],
      ['catalogue', 'grid', 'Service catalogue'],
    ],
  },
  {
    label: 'Customers',
    links: [
      ['clients', 'clients', 'Clients'],
      ['contacts', 'contacts', 'Contacts'],
      ['sites', 'sites', 'Sites'],
      ['assets', 'assets', 'Assets'],
    ],
  },
  {
    label: 'Management',
    links: [
      ['reports', 'reports', 'Service performance'],
      ['sla', 'sla', 'SLA policies'],
    ],
  },
  {
    label: 'Administration',
    links: [
      ['users', 'users', 'Users & access'],
      ['groups', 'team', 'Groups'],
      ['categories', 'tags', 'Categories & tags'],
      ['service-admin', 'grid', 'Service administration'],
      ['cab', 'check', 'CAB & change policy'],
      ['email', 'contacts', 'Email administration'],
      ['audit', 'audit', 'Audit history'],
    ],
  },
  {
    label: 'Portals & help',
    links: [
      ['client', 'clients', 'Client portal'],
      ['support', 'contacts', 'Request support'],
      ['help', 'categories', 'Help & user guide'],
      ['login', 'switch', 'Sign-in screen'],
    ],
  },
];
