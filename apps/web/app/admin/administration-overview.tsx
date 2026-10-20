'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { WorkspaceFrame, useWorkspace } from '../workspace-tools';
import UiIcon, { type IconName } from '../ui-icon';
import './administration-overview.css';
type Summary = {
  active_users: number;
  active_customers: number;
  active_contacts: number;
  active_groups: number;
  customer_groups: number;
  staff_groups: number;
  sites: number;
  tickets: number;
};
type Audit = {
  id: string;
  action: string;
  entity_name?: string;
  actor_name?: string;
  created_at: string;
};
const areas: {
  title: string;
  description: string;
  links: [string, string, IconName][];
}[] = [
  {
    title: 'Customers & relationships',
    description:
      'Keep your customer organizations and shared access organized.',
    links: [
      ['/admin/clients', 'Clients', 'clients'],
      ['/admin/contacts', 'Contacts', 'contacts'],
      ['/admin/sites', 'Sites', 'sites'],
      ['/admin/groups', 'Customer & staff groups', 'team'],
    ],
  },
  {
    title: 'People & access',
    description: 'Manage staff accounts, workspace roles and review changes.',
    links: [
      ['/admin/users', 'Users & Access', 'users'],
      ['/admin/audit-logs', 'Audit History', 'audit'],
    ],
  },
  {
    title: 'Service configuration',
    description: 'Configure the rules that keep your service desk consistent.',
    links: [
      ['/admin/service-management', 'Service administration', 'grid'],
      ['/admin/categories', 'Categories', 'categories'],
      ['/admin/tags', 'Tags', 'tags'],
      ['/admin/sla', 'SLA Management', 'sla'],
      ['/admin/change-governance', 'CAB & change policy', 'change'],
    ],
  },
  {
    title: 'Channels & reporting',
    description:
      'Connect customer support channels and review service results.',
    links: [
      ['/admin/email', 'Email administration', 'contacts'],
      ['/admin/client-domains', 'Client support portal', 'clients'],
      ['/admin/reports', 'Reports & Analytics', 'reports'],
      ['/service-reports', 'Service performance', 'reports'],
    ],
  },
];
export default function AdministrationOverview() {
  const w = useWorkspace();
  const { request, setError, revision } = w;
  const admin = Boolean(w.session?.user.roles.includes('ADMIN'));
  const [summary, setSummary] = useState<Summary>();
  const [audit, setAudit] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!admin) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setSummary(undefined);
      setAudit([]);
      setError('');
      void Promise.all([
        request<Summary>('/admin/overview', { signal: abort.signal }),
        request<{ items: Audit[] }>('/admin/audit-logs?pageSize=6', {
          signal: abort.signal,
        }),
      ])
        .then(([counts, events]) => {
          if (!abort.signal.aborted) {
            setSummary(counts);
            setAudit(events.items);
          }
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [admin, request, setError, revision]);
  return (
    <WorkspaceFrame
      title="Administration overview"
      user={w.session?.user}
      csrfToken={w.session?.csrfToken}
      error={
        w.error ||
        (w.session && !admin ? 'Administrator access is required.' : '')
      }
      notice={w.notice}
      pageHeading={
        <header className="administration-hero">
          <div>
            <p>ADMINISTRATION / WORKSPACE</p>
            <h1>Keep your service desk organized.</h1>
            <span>
              Manage people, customers, permissions and service configuration.
            </span>
          </div>
          <UiIcon name="grid" />
        </header>
      }
    >
      {admin ? (
        <div className="administration-overview">
          <div className="administration-tools">
            <h2>Your administration overview</h2>
            <button
              className="secondary"
              disabled={loading}
              onClick={w.refresh}
            >
              Refresh overview
            </button>
          </div>
          {loading || (!summary && !w.error) ? (
            <p role="status" className="notice">
              Loading administration overview…
            </p>
          ) : null}
          {summary ? (
            <div className="administration-metrics">
              {[
                ['Active users', summary.active_users, '/admin/users', 'users'],
                [
                  'Active customers',
                  summary.active_customers,
                  '/admin/clients',
                  'clients',
                ],
                [
                  'Active contacts',
                  summary.active_contacts,
                  '/admin/contacts',
                  'contacts',
                ],
                [
                  'Active groups',
                  summary.active_groups,
                  '/admin/groups',
                  'team',
                ],
              ].map(([title, value, href, icon]) => (
                <Link
                  className="administration-metric"
                  href={String(href)}
                  key={String(title)}
                >
                  <span className="administration-metric-label">
                    <UiIcon name={icon as IconName} />
                    {title}
                  </span>
                  <strong>{value}</strong>
                  <small>
                    {title === 'Active groups'
                      ? `${summary.customer_groups} customer · ${summary.staff_groups} staff`
                      : 'Manage records →'}
                  </small>
                </Link>
              ))}
            </div>
          ) : null}
          <section
            className="administration-areas"
            aria-label="Administration areas"
          >
            {areas.map((area) => (
              <article className="panel administration-area" key={area.title}>
                <h2>{area.title}</h2>
                <p>{area.description}</p>
                <div>
                  {area.links.map(([href, label, icon]) => (
                    <Link href={href} key={href}>
                      <span className="administration-area-icon">
                        <UiIcon name={icon} />
                      </span>
                      <strong>{label}</strong>
                      <span aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </section>
          <div className="administration-bottom">
            <section className="panel administration-audit">
              <div className="administration-tools">
                <h2>Recent administration activity</h2>
                <Link href="/admin/audit-logs">View audit history →</Link>
              </div>
              {audit.length ? (
                <ol>
                  {audit.map((event) => (
                    <li key={event.id}>
                      <UiIcon name="audit" />
                      <div>
                        <strong>
                          {event.action
                            .replaceAll('_', ' ')
                            .replaceAll('.', ' · ')}
                        </strong>
                        <span>
                          {event.actor_name ?? 'System'}
                          {event.entity_name ? ` · ${event.entity_name}` : ''}
                        </span>
                      </div>
                      <time dateTime={event.created_at}>
                        {new Date(event.created_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>
                  {loading
                    ? 'Loading activity…'
                    : w.error
                      ? 'Activity could not be loaded. Refresh to retry.'
                      : 'No administration activity yet.'}
                </p>
              )}
            </section>
            <aside className="administration-access-tip">
              <UiIcon name="team" />
              <h2>Shared access starts with groups.</h2>
              <p>
                Build customer contact groups and staff groups. Choose their
                members and permissions while keeping customer access
                controlled.
              </p>
              <Link className="primary" href="/admin/groups">
                Manage groups
              </Link>
              <Link href="/admin/tickets">Open ticket queue →</Link>
            </aside>
          </div>
        </div>
      ) : null}
    </WorkspaceFrame>
  );
}
