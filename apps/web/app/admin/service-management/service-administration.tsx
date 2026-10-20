'use client';
import Link from 'next/link';
import { WorkspaceFrame, useWorkspace } from '../../workspace-tools';
import '../administration-overview.css';

const modules = [
  {
    title: 'Ticket administration',
    description:
      'Manage the service categories, SLAs, customer routing and staff access used by the Technician workspace.',
    links: [
      ['/admin/categories', 'Categories & subcategories'],
      ['/admin/tags', 'Technology & service tags'],
      ['/admin/sla', 'SLA policies'],
      ['/admin/sites', 'Site domains & ticket numbering'],
      ['/admin/users', 'Staff roles & permissions'],
      ['/admin/groups', 'Customer & staff groups'],
      ['/admin/tickets', 'View tickets'],
    ],
  },
  {
    title: 'Change administration',
    description:
      'Configure approval requirements, CAB membership, change templates, scheduling restrictions and staff access.',
    links: [
      [
        '/admin/change-governance',
        'CAB, approval policy, templates & blackouts',
      ],
      ['/admin/users', 'Change access & staff roles'],
      ['/admin/groups', 'Staff group permissions'],
      ['/changes?workspace=admin', 'View changes'],
    ],
  },
  {
    title: 'Problem administration',
    description:
      'Manage who can investigate problems and review recurring incidents, root causes, known errors and investigation history.',
    links: [
      ['/admin/users', 'Staff roles & customer/site scope'],
      ['/admin/groups', 'Staff groups'],
      ['/problems?workspace=admin', 'View problems'],
      ['/admin/audit-logs', 'Audit history'],
    ],
  },
];

export default function ServiceAdministration() {
  const { session, error } = useWorkspace();
  const allowed =
    session?.user.workspace === 'admin' && session.user.roles.includes('ADMIN');
  return (
    <WorkspaceFrame
      title="Service administration"
      description="Configure Tickets, Changes and Problems for your support teams."
      user={session?.user}
      csrfToken={session?.csrfToken}
      error={error}
    >
      {!session ? (
        <p role="status">Loading administration…</p>
      ) : !allowed ? (
        <section className="panel">
          <h2>Administration workspace required</h2>
          <p>
            Select the Administration workspace using an authorized
            administrator account.
          </p>
          <Link href="/">Choose workspace</Link>
        </section>
      ) : (
        <div className="administration-overview">
          <section className="panel">
            <h2>Configuration and oversight</h2>
            <p>
              Set up the rules and access used by technicians. Service records
              are read-only here; creation, replies, investigation updates and
              workflow decisions belong in an authorized support workspace.
            </p>
          </section>
          <div className="administration-areas">
            {modules.map((module) => (
              <section className="panel administration-area" key={module.title}>
                <h2>{module.title}</h2>
                <p>{module.description}</p>
                <div className="administration-area-links">
                  {module.links.map(([href, title]) => (
                    <Link className="secondary" key={href} href={href}>
                      {title}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </WorkspaceFrame>
  );
}
