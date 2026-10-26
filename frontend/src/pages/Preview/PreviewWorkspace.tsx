'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import BrandMark from '../../components/ui/BrandMark';
import UiIcon from '../../components/ui/UiIcon';
import NavbarTools from '../../components/layout/Navbar/NavbarTools';
import Dashboard from '../Dashboard/Dashboard';
import LoginScreen from '../Login/components/LoginScreen';
import MetricCard from '../../components/ui/MetricCard';
import Dialog from '../../components/ui/Dialog';
import TicketQueue, {
  TicketTable,
  NewTicketDialog,
  TicketDetail,
  Status,
} from './components/TicketQueue';
import RecordWorkspace from './components/RecordWorkspace';
import KnowledgeWorkspace from './components/KnowledgeWorkspace';
import {
  initialTickets,
  trend,
  moduleTitles,
  type ModuleId,
  type Ticket,
  records,
} from './data/fixtures';
import { previewNavigation } from '../../routes/previewNavigation';
import { exportCsv } from '../../utils/exportCsv';
import './PreviewWorkspace.css';

const descriptions: Partial<Record<ModuleId, string>> = {
  dashboard:
    'Your workload, service priorities and recent conversations in one place.',
  tickets: 'Every request, organized. Keep your team focused on what matters.',
  team: 'Keep track of your team’s queue and shared service commitments.',
  internal: 'Manage internal service requests and staff support.',
  changes: 'Plan, review, and deliver changes with confidence.',
  problems: 'Find the root cause. Prevent the next incident.',
  knowledge: 'Helpful answers, practical guides, and shared team knowledge.',
  catalogue: 'The right service, just a request away.',
  reports: 'Understand your service delivery with clear, actionable insights.',
  client: 'Your support requests and conversations, all in one place.',
  support: 'Tell us what you need. Your service desk is here to help.',
  help: 'A little guidance for a smoother service journey.',
};

export default function PreviewWorkspace() {
  const params = useSearchParams() ?? new URLSearchParams();
  const router = useRouter();
  const requested = params.get('module') ?? 'dashboard';
  const module = (
    Object.hasOwn(moduleTitles, requested) ? requested : 'dashboard'
  ) as ModuleId;
  const [tickets, setTickets] = useState(initialTickets);
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [create, setCreate] = useState(false);
  const [preset, setPreset] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [notifications, setNotifications] = useState(false);
  const [noticeRead, setNoticeRead] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const title = moduleTitles[module];
  const selected = tickets.find((t) => t.id === selectedId);
  function notify(text: string) {
    setToast(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 4500);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      document.body.removeAttribute('data-sidebar-collapsed');
    },
    [],
  );
  function toggleMenu() {
    if (window.innerWidth > 1000) {
      const next = !collapsed;
      setCollapsed(next);
      document.body.dataset.sidebarCollapsed = String(next);
    } else setMenu(!menu);
  }
  function newRequest(subject = '') {
    setPreset(subject);
    setCreate(true);
  }
  const counts = {
    open: tickets.filter((t) => !['Resolved', 'Closed'].includes(t.status))
      .length,
    new: tickets.filter((t) => t.status === 'New').length,
    in_progress: tickets.filter((t) => t.status === 'In progress').length,
    waiting: tickets.filter((t) => t.status === 'Waiting for client').length,
    recently_resolved: tickets.filter((t) => t.status === 'Resolved').length,
    sla_at_risk: tickets.filter((t) => t.sla === 'At risk').length,
    sla_breached: tickets.filter((t) => t.sla === 'Breached').length,
    unattended: 1,
  };
  const ticketModules = ['tickets', 'team', 'internal', 'client'].includes(
    module,
  );
  if (module === 'login')
    return (
      <>
        <Link href="/ui-preview" className="spark-back-preview">
          ← Back to workspace preview
        </Link>
        <LoginScreen preview signInHref="/ui-preview" />
      </>
    );
  return (
    <div className="admin-shell ticket-shell spark-preview">
      <a className="skip-link" href="#preview-main">
        Skip to content
      </a>
      {menu && (
        <button
          className="spark-sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Link className="brand" href="/ui-preview">
          <BrandMark />
          <span>
            ASTRA<small>Ticketing System</small>
          </span>
        </Link>
        <p className="nav-label">SERVICE WORKSPACE</p>
        <nav aria-label="Preview navigation">
          {previewNavigation.map((group) => (
            <div className="workspace-nav-group" key={group.label}>
              <p className="workspace-nav-group-label">{group.label}</p>
              {group.links.map(([id, icon, label]) => (
                <Link
                  key={id}
                  href={`/ui-preview?module=${id}`}
                  aria-current={id === module ? 'page' : undefined}
                  title={collapsed ? label : undefined}
                  onClick={() => {
                    setMenu(false);
                    setSelectedId(null);
                  }}
                >
                  <span className="nav-symbol">
                    <UiIcon name={icon} />
                  </span>
                  <span>{label}</span>
                  {id === 'tickets' && (
                    <b className="spark-nav-count">{tickets.length}</b>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="spark-preview-badge">UI PREVIEW</span>
          <small>
            <i />
            Fictional sample data
          </small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="menu-button spark-icon-button"
            aria-label="Toggle navigation"
            aria-expanded={menu || !collapsed}
            onClick={toggleMenu}
          >
            ☰
          </button>
          <span className="breadcrumb">
            {title === 'My service desk' ? 'Dashboard' : title}
          </span>
          <NavbarTools />
          <button
            className="spark-icon-button spark-notification-button"
            aria-label="Open notifications"
            onClick={() => setNotifications(true)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
            </svg>
            {!noticeRead && <i />}
          </button>
          <div className="profile">
            <span className="avatar">JC</span>
            <div>
              Jamie Carter<small>Service desk · Preview</small>
            </div>
          </div>
        </header>
        <main id="preview-main">
          <div className="spark-preview-notice">
            <span>
              <i />
              Design preview <b>·</b> Sample records only
            </span>
            <span>Inspired by SPARK / Orbit</span>
          </div>
          {module === 'dashboard' ? (
            <>
              <div className="spark-welcome-line">
                <span>YOUR WORKSPACE, AT A GLANCE</span>
                <span>Tuesday, 20 October 2026</span>
              </div>
              <Dashboard
                mode="technician"
                counts={counts}
                trend={trend}
                queueHref="/ui-preview?module=tickets"
                newTicketHref="/ui-preview?module=tickets&new=1"
                distributions={<Distributions tickets={tickets} />}
                recent={
                  <TicketTable
                    tickets={tickets.slice(0, 5)}
                    onSelect={(t) => setSelectedId(t.id)}
                  />
                }
              />
            </>
          ) : (
            <>
              <header className="page-heading">
                <div>
                  <p className="eyebrow">
                    ASTRA /{' '}
                    {previewNavigation
                      .find((g) => g.links.some(([id]) => id === module))
                      ?.label.toUpperCase()}
                  </p>
                  <h1>{title}</h1>
                  <p>{records[module]?.description ?? descriptions[module]}</p>
                </div>
                {ticketModules ? (
                  <button className="primary" onClick={() => newRequest()}>
                    <span aria-hidden="true">＋</span>{' '}
                    {module === 'client' ? 'New request' : 'New ticket'}
                  </button>
                ) : module === 'reports' ? (
                  <button
                    className="primary"
                    onClick={() => {
                      exportCsv(
                        'astra-service-performance-sample.csv',
                        tickets.map((t) => ({
                          Ticket: t.id,
                          Subject: t.subject,
                          Client: t.client,
                          Status: t.status,
                          Priority: t.priority,
                          SLA: t.sla,
                        })),
                      );
                      notify('Sample service report exported.');
                    }}
                  >
                    <UiIcon name="reports" />
                    Export report
                  </button>
                ) : null}
              </header>
              {ticketModules && (
                <>
                  <div className="spark-queue-tabs">
                    <Link
                      href="/ui-preview?module=tickets"
                      aria-current={module === 'tickets' ? 'page' : undefined}
                    >
                      All tickets <span>{tickets.length}</span>
                    </Link>
                    <Link
                      href="/ui-preview?module=team"
                      aria-current={module === 'team' ? 'page' : undefined}
                    >
                      Team queue
                    </Link>
                    <Link
                      href="/ui-preview?module=internal"
                      aria-current={module === 'internal' ? 'page' : undefined}
                    >
                      Internal requests
                    </Link>
                  </div>
                  <TicketQueue
                    key={
                      module + params.get('status') + params.get('slaStatus')
                    }
                    tickets={
                      module === 'client'
                        ? tickets.filter((t) => t.client === 'Northstar Labs')
                        : module === 'internal'
                          ? tickets.filter(
                              (t) =>
                                t.category === 'Security' ||
                                t.category === 'Hardware',
                            )
                          : tickets
                    }
                    onSelect={(t) => setSelectedId(t.id)}
                    initialStatus={
                      { NEW: 'New', IN_PROGRESS: 'In progress' }[
                        params.get('status') ?? ''
                      ] ?? ''
                    }
                    initialSla={params.get('slaStatus') ?? ''}
                  />
                </>
              )}
              {(records[module] ||
                module === 'changes' ||
                module === 'problems') && (
                <RecordWorkspace key={module} module={module} notify={notify} />
              )}
              {(module === 'knowledge' || module === 'catalogue') && (
                <KnowledgeWorkspace
                  key={module}
                  catalogue={module === 'catalogue'}
                  onRequest={newRequest}
                />
              )}
              {module === 'reports' && <Reports tickets={tickets} />}
              {module === 'support' && (
                <SupportForm
                  onSubmit={() =>
                    notify(
                      'Your sample request has been received. No live ticket was created.',
                    )
                  }
                />
              )}
              {module === 'help' && <HelpGuide />}
            </>
          )}
          <footer className="spark-page-footer">
            <span>ASTRA · Amnikon Technologies</span>
            <span>
              SPARK design system <b>·</b> UI review
            </span>
          </footer>
        </main>
      </div>
      {(create || params.get('new') === '1') && (
        <NewTicketDialog
          preset={preset}
          onClose={() => {
            setCreate(false);
            router.replace(`/ui-preview?module=${module}`);
          }}
          onSave={(draft) => {
            const ticket = {
              ...draft,
              id: `INC-${String(129 + tickets.length - initialTickets.length).padStart(6, '0')}`,
              updated: 'just now',
              requester: 'Jamie Carter',
              sla: 'On track',
              status: 'New',
            };
            setTickets([ticket, ...tickets]);
            setCreate(false);
            router.replace('/ui-preview?module=tickets');
            notify(`${ticket.id} created in the sample workspace.`);
          }}
        />
      )}
      {selected && (
        <TicketDetail
          key={selected.id}
          ticket={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={(updated) => {
            setTickets(tickets.map((t) => (t.id === updated.id ? updated : t)));
            notify('Sample ticket updated.');
          }}
        />
      )}
      {notifications && (
        <Dialog title="Notifications" onClose={() => setNotifications(false)}>
          <div className="spark-notifications">
            <button
              onClick={() => {
                setSelectedId('INC-000128');
                setNotifications(false);
                setNoticeRead(true);
              }}
            >
              <span className="spark-feature-icon">
                <UiIcon name="tickets" />
              </span>
              <div>
                <strong>You have a ticket update</strong>
                <p>INC-000128 · VPN connection request</p>
                <small>5 minutes ago · Sample notification</small>
              </div>
            </button>
            <button
              onClick={() => {
                router.push('/ui-preview?module=changes');
                setNotifications(false);
                setNoticeRead(true);
              }}
            >
              <span className="spark-feature-icon">
                <UiIcon name="change" />
              </span>
              <div>
                <strong>A change is waiting for review</strong>
                <p>Firewall firmware upgrade</p>
                <small>30 minutes ago · Sample notification</small>
              </div>
            </button>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setNoticeRead(true);
              notify('Sample notifications marked as read.');
            }}
          >
            Mark all as read
          </button>
        </Dialog>
      )}
      {toast && (
        <div className="spark-toast" role="status">
          <UiIcon name="check" />
          {toast}
          <button
            onClick={() => setToast('')}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function Distributions({ tickets }: { tickets: Ticket[] }) {
  return (
    <>
      {[
        {
          title: 'Tickets by client',
          key: 'client' as const,
          colors: ['#2563eb', '#8051d7', '#0b9b68', '#e3a32e'],
        },
        {
          title: 'Tickets by priority',
          key: 'priority' as const,
          colors: ['#e36c6c', '#e3a32e', '#2563eb', '#0b9b68'],
        },
      ].map((group) => {
        const values = Array.from(new Set(tickets.map((t) => t[group.key])));
        return (
          <section className="panel spark-distribution" key={group.title}>
            <div className="section-heading">
              <h2>{group.title}</h2>
              <UiIcon name="reports" />
            </div>
            {values.map((value, i) => {
              const count = tickets.filter(
                (t) => t[group.key] === value,
              ).length;
              return (
                <div className="spark-bar" key={value}>
                  <div>
                    <span>
                      <i style={{ background: group.colors[i % 4] }} />
                      {value}
                    </span>
                    <b>{count}</b>
                  </div>
                  <div className="spark-bar-track">
                    <span
                      style={{
                        width: `${(count / tickets.length) * 100}%`,
                        background: group.colors[i % 4],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}
function Reports({ tickets }: { tickets: Ticket[] }) {
  const [period, setPeriod] = useState('Last 14 days');
  const [client, setClient] = useState('All clients');
  const filtered =
    client === 'All clients'
      ? tickets
      : tickets.filter((t) => t.client === client);
  const onTrack = filtered.filter((t) =>
    ['On track', 'Met'].includes(t.sla),
  ).length;
  return (
    <>
      <div className="spark-report-filters">
        <label>
          Reporting period
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option>Last 14 days</option>
            <option>Last 7 days</option>
          </select>
        </label>
        <label>
          Client
          <select value={client} onChange={(e) => setClient(e.target.value)}>
            {['All clients', ...new Set(tickets.map((t) => t.client))].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <span>Fictional snapshot · {period}</span>
      </div>
      <div className="corporate-metrics">
        <MetricCard
          label="Total tickets"
          value={filtered.length}
          icon={<UiIcon name="tickets" />}
        />
        <MetricCard
          label="Resolved"
          value={filtered.filter((t) => t.status === 'Resolved').length}
          icon={<UiIcon name="check" />}
          tone="teal"
        />
        <MetricCard
          label="SLA on track / met"
          value={onTrack}
          icon={<UiIcon name="sla" />}
          tone="teal"
        />
        <MetricCard
          label="SLA at risk / breached"
          value={
            filtered.filter((t) => ['At risk', 'Breached'].includes(t.sla))
              .length
          }
          icon={<UiIcon name="alert" />}
          tone="amber"
        />
      </div>
      <div className="spark-report-chart panel">
        <div className="section-heading">
          <div>
            <h2>Service activity</h2>
            <p className="hint">
              Sample created and resolved volume · {period}
            </p>
          </div>
          <span className="corporate-pill">{client}</span>
        </div>
        <div className="spark-column-chart">
          {(period === 'Last 7 days' ? trend.slice(-7) : trend).map((day) => (
            <div key={day.day}>
              <div>
                <i
                  style={{ height: `${(day.created / 16) * 100}%` }}
                  title={`${day.created} created`}
                />
                <i
                  style={{ height: `${(day.resolved / 16) * 100}%` }}
                  title={`${day.resolved} resolved`}
                />
              </div>
              <span>{day.day.slice(8)} Oct</span>
            </div>
          ))}
        </div>
        <div className="spark-chart-legend">
          <span>
            <i />
            Created
          </span>
          <span>
            <i />
            Resolved
          </span>
        </div>
        <details className="spark-chart-data">
          <summary>View exact daily counts</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Created</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {(period === 'Last 7 days' ? trend.slice(-7) : trend).map(
                  (d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td>{d.created}</td>
                      <td>{d.resolved}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </details>
      </div>
      <div className="corporate-distributions">
        <Distributions tickets={filtered} />
      </div>
      <p className="spark-sample-note">
        Client filters apply to ticket metrics and distributions. The activity
        chart shows the overall fictional service-desk trend.
      </p>
    </>
  );
}
function SupportForm({ onSubmit }: { onSubmit: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="spark-support-layout">
      <section className="panel">
        <div className="section-heading">
          <h2>How can we help?</h2>
          <Status value="Service desk available" />
        </div>
        {submitted ? (
          <div className="spark-empty">
            <span className="spark-feature-icon">
              <UiIcon name="check" />
            </span>
            <h3>Your sample request is ready</h3>
            <p>
              This is a UI preview. No email was sent and no live ticket was
              created.
            </p>
            <button className="primary" onClick={() => setSubmitted(false)}>
              Create another sample request
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
              onSubmit();
            }}
          >
            <div className="spark-form-grid">
              <label className="spark-field">
                Your name
                <input name="name" required placeholder="Full name" />
              </label>
              <label className="spark-field">
                Work email
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                />
              </label>
            </div>
            <label className="spark-field">
              Subject
              <input
                name="subject"
                required
                placeholder="A short description of your request"
              />
            </label>
            <label className="spark-field">
              How can we help?
              <textarea
                required
                name="description"
                rows={6}
                placeholder="Describe the issue and anything you have already tried."
              />
            </label>
            <button className="primary">Submit sample request →</button>
          </form>
        )}
      </section>
      <aside>
        <section className="panel spark-support-card">
          <span className="spark-feature-icon">
            <UiIcon name="contacts" />
          </span>
          <h2>You’re in good hands</h2>
          <p>
            Give us a clear description of what happened, the affected service,
            and any error messages.
          </p>
          <Link href="/ui-preview?module=knowledge" className="text-button">
            Explore the knowledge base →
          </Link>
        </section>
        <section className="panel spark-support-card">
          <h2>Already have a ticket?</h2>
          <p>
            Check your client portal to follow progress and continue the
            conversation.
          </p>
          <Link href="/ui-preview?module=client" className="text-button">
            Open client portal →
          </Link>
        </section>
      </aside>
    </div>
  );
}
function HelpGuide() {
  return (
    <div className="spark-help-grid">
      <section className="panel">
        <h2>Make the most of your workspace</h2>
        {[
          {
            title: 'Create and track a ticket',
            body: 'Open All tickets and choose New ticket. Add a clear subject, client, category, and description. Open a ticket to follow activity and update its status.',
          },
          {
            title: 'Internal notes and public replies',
            body: 'Internal notes are for the service team. Public replies are visible to the requester. Always check the selected composer tab before posting.',
          },
          {
            title: 'Plan and review a change',
            body: 'Use Change Management to record the purpose, scope, planned window, approval, implementation, and rollback information.',
          },
          {
            title: 'Find a page quickly',
            body: 'Use the navigation search in the top bar. Press Ctrl K or Command K to open it from any workspace screen.',
          },
          {
            title: 'Review service performance',
            body: 'Open Service performance to compare activity and SLA status. Filter the sample report by client or export the displayed records.',
          },
        ].map((item) => (
          <details className="spark-guide-item" key={item.title}>
            <summary>
              {item.title}
              <span>＋</span>
            </summary>
            <p>{item.body}</p>
          </details>
        ))}
      </section>
      <section className="panel spark-support-card">
        <span className="spark-feature-icon">
          <UiIcon name="categories" />
        </span>
        <h2>A connected service desk</h2>
        <p>
          Tickets, changes, problems, knowledge, and customer information share
          a consistent SPARK-style workspace.
        </p>
        <Link href="/ui-preview?module=knowledge" className="primary">
          Browse knowledge base
        </Link>
      </section>
    </div>
  );
}
