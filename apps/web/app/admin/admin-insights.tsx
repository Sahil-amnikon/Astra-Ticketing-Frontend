'use client';
import WorkspaceNavigation from '../workspace-navigation';
import HolisticReports from '../management/holistic-reports';
import { extensionLinks } from '../workspace-navigation-data';
import { useSidebarScroll } from '../sidebar-scroll';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import BrandMark from '../brand-mark';
import NotificationCenter from '../notification-center';
import UiIcon, { type IconName } from '../ui-icon';

type Row = Record<string, unknown>;
type Session = {
  csrfToken: string;
  user: {
    displayName: string;
    roles: string[];
    workspace?: string;
    permissions?: string[];
    changeAccess?: string;
  };
};

const priorities: Record<string, string> = {
  P1_CRITICAL: 'P1 Critical',
  P2_HIGH: 'P2 High',
  P3_MEDIUM: 'P3 Medium',
  P4_LOW: 'P4 Low',
};
const adminNav: [string, IconName, string][] = [
  ['/admin', 'dashboard', 'Dashboard'],
  ['/admin/tickets', 'tickets', 'Tickets'],
  ['/admin/sla', 'sla', 'SLA Management'],
  ['/admin/reports', 'reports', 'Reports & Analytics'],
  ['/admin/users', 'users', 'Users & Access'],
  ['/admin/clients', 'clients', 'Clients'],
  ['/admin/contacts', 'contacts', 'Contacts'],
  ['/admin/sites', 'sites', 'Sites'],
  ['/admin/categories', 'categories', 'Categories'],
  ['/admin/tags', 'tags', 'Tags'],
  ['/admin/audit-logs', 'audit', 'Audit History'],
  ['/changes', 'change', 'Change Management'],
];

export default function AdminInsights({
  section,
  workspace = 'admin',
}: {
  section: 'sla' | 'reports';
  workspace?: 'admin' | 'management';
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session>();
  const [rows, setRows] = useState<Row[]>([]);
  const [calendars, setCalendars] = useState<Row[]>([]);
  const [technicians, setTechnicians] = useState<Row[]>([]);
  const [tickets, setTickets] = useState<Row[]>([]);
  const [technicianId, setTechnicianId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  const [range, setRange] = useState(() => monthRange());
  const request = useCallback(
    async (path: string, init?: RequestInit) => {
      const response = await fetch(`/api${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
          ...(session ? { 'x-csrf-token': session.csrfToken } : {}),
          ...init?.headers,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error?.message ?? 'Request failed.');
      return body;
    },
    [session],
  );

  useEffect(() => {
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Sign in to open this workspace.');
        const current = (await response.json()) as Session;
        const permitted =
          workspace === 'admin'
            ? current.user.roles.includes('ADMIN')
            : current.user.roles.includes('ADMIN') ||
              current.user.permissions?.includes(
                section === 'sla' ? 'SLA_MANAGE' : 'REPORTS_VIEW',
              );
        if (!permitted)
          throw new Error(
            workspace === 'admin'
              ? 'Administrator access is required.'
              : 'Manager or administrator access is required.',
          );
        setSession(current);
      })
      .catch((reason: Error) => {
        setError(reason.message);
        setLoading(false);
      });
  }, [section, workspace]);
  useEffect(() => {
    if (!session) return;
    const operation =
      section === 'sla'
        ? Promise.all([request('/sla/policies'), request('/sla/calendars')])
        : request(`/reports/technicians?${reportQuery(range, technicianId)}`);
    void operation
      .then((result) => {
        if (section === 'sla') {
          const [policies, availableCalendars] = result as [Row[], Row[]];
          setRows(policies);
          setCalendars(decorateCalendars(availableCalendars));
          return;
        }
        const report = result as {
          rows: Row[];
          technicians: Row[];
          tickets: Row[];
        };
        setRows(report.rows);
        setTechnicians(report.technicians);
        setTickets(report.tickets);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [range, request, section, session, technicianId]);

  async function logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
      router.push('/');
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function savePolicy(row: Row) {
    setError('');
    setNotice('');
    try {
      await request(`/sla/policies/${row.priority}`, {
        method: 'PATCH',
        body: JSON.stringify({
          responseMinutes: Number(row.response_minutes),
          resolutionMinutes: Number(row.resolution_minutes),
          warningPercent: Number(row.warning_percent),
          active: Boolean(row.active),
          calendarId: String(row.calendar_id),
          applyToOpenTickets: Boolean(row.apply_to_open),
        }),
      });
      setNotice(`${priorities[String(row.priority)]} SLA policy saved.`);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  async function saveCalendar(row: Row) {
    setError('');
    setNotice('');
    try {
      const holidays = String(row.holiday_text ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [date, ...name] = line.split('|');
          return { date: date?.trim(), name: name.join('|').trim() };
        });
      const body = JSON.stringify({
        name: String(row.name),
        timezone: String(row.timezone),
        workingDays: String(row.working_days_text ?? '')
          .split(',')
          .map((day) => Number(day.trim())),
        workStart: String(row.work_start).slice(0, 5),
        workEnd: String(row.work_end).slice(0, 5),
        active: Boolean(row.active),
        holidays,
      });
      const id = String(row.id ?? '');
      await request(id ? `/sla/calendars/${id}` : '/sla/calendars', {
        method: id ? 'PATCH' : 'POST',
        body,
      });
      const refreshed = (await request('/sla/calendars')) as Row[];
      setCalendars(decorateCalendars(refreshed));
      setNotice(`SLA calendar ${id ? 'updated' : 'created'}.`);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  const updateCalendar = (index: number, key: string, value: unknown) =>
    setCalendars((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    );
  const updateRow = (index: number, key: string, value: unknown) =>
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    );
  const query = useMemo(
    () => reportQuery(range, technicianId),
    [range, technicianId],
  );
  const title = section === 'sla' ? 'SLA Management' : 'Reports & Analytics';
  const managementNav: [string, IconName, string][] = [
    ['/management', 'dashboard', 'Dashboard'],
    ['/management/tickets', 'tickets', 'Tickets'],
    ...(session?.user.permissions?.includes('SLA_MANAGE') ||
    session?.user.roles.includes('ADMIN')
      ? ([['/management/sla', 'sla', 'SLA Management']] as [
          string,
          IconName,
          string,
        ][])
      : []),
    ...(session?.user.permissions?.includes('REPORTS_VIEW') ||
    session?.user.roles.includes('ADMIN')
      ? ([['/management/reports', 'reports', 'Reports & Analytics']] as [
          string,
          IconName,
          string,
        ][])
      : []),
    ...(session?.user.changeAccess && session.user.changeAccess !== 'NONE'
      ? ([['/changes', 'change', 'Change Management']] as [
          string,
          IconName,
          string,
        ][])
      : []),
  ];
  const nav = workspace === 'admin' ? adminNav : managementNav;
  const base = workspace === 'admin' ? '/admin' : '/management';
  const label = workspace === 'admin' ? 'Administration' : 'Management';
  const sidebarScroll = useSidebarScroll(
    `${base}/${section}`,
    Boolean(session),
  );
  return (
    <div className="admin-shell ticket-shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Link className="brand" href={base}>
          <BrandMark />
          <span>
            ASTRA<small>Ticketing System</small>
          </span>
        </Link>
        <p className="nav-label">{label.toUpperCase()}</p>
        <nav ref={sidebarScroll} aria-label={`${label} navigation`}>
          <WorkspaceNavigation
            workspace={session?.user.workspace}
            links={[...nav, ...extensionLinks(session?.user)]}
            activeHref={`${base}/${section}`}
            onNavigate={() => setMenu(false)}
          />
        </nav>
        <div className="sidebar-bottom">
          <Link href="/">
            <UiIcon name="switch" /> Switch workspace
          </Link>
          <small>
            <i /> Service desk online
          </small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="menu-button secondary"
            aria-expanded={menu}
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
          <span className="breadcrumb">
            {label} <span>/</span> {title}
          </span>
          <div className="profile">
            <span className="avatar">
              {session?.user.displayName.slice(0, 1) ?? 'A'}
            </span>
            <div>
              {session?.user.displayName ?? 'ASTRA'}
              <small>{label}</small>
            </div>
            {session ? (
              <>
                <NotificationCenter
                  csrfToken={session.csrfToken}
                  ticketBase={
                    workspace === 'admin'
                      ? '/admin/ticket'
                      : '/management/tickets'
                  }
                />
                <Link className="secondary" href="/">
                  Switch workspace
                </Link>
                <button className="secondary" onClick={() => void logout()}>
                  Sign out
                </button>
              </>
            ) : null}
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">SERVICE OPERATIONS / CONTROL</p>
              <h1>{title}</h1>
              <p>
                {section === 'sla'
                  ? 'Set response and resolution targets for each ticket priority.'
                  : 'Review a holistic overview of tickets, changes and problems, with charts, overall numbers and downloads.'}
              </p>
            </div>
          </div>
          {error ? (
            <div className="notice error" role="alert">
              {error} {!session ? <Link href="/">Sign in</Link> : null}
            </div>
          ) : null}
          {notice ? (
            <div className="notice" role="status">
              {notice}
            </div>
          ) : null}
          {loading ? (
            <div className="notice">Loading {title.toLowerCase()}…</div>
          ) : null}
          {!loading && session && section === 'sla' ? (
            <SlaTable
              rows={rows}
              calendars={calendars}
              updateRow={updateRow}
              savePolicy={savePolicy}
              updateCalendar={updateCalendar}
              saveCalendar={saveCalendar}
              addCalendar={() =>
                setCalendars((current) => [
                  ...current,
                  {
                    name: 'New support calendar',
                    timezone: 'Asia/Kolkata',
                    working_days_text: '1,2,3,4,5',
                    work_start: '09:00',
                    work_end: '18:00',
                    active: true,
                    holiday_text: '',
                    holidays: [],
                  },
                ])
              }
            />
          ) : null}
          {!loading && session && section === 'reports' ? (
            <>
              <HolisticReports
                request={request}
                allowed={
                  ['admin', 'management'].includes(
                    session.user.workspace ?? '',
                  ) &&
                  (session.user.roles.includes('ADMIN') ||
                    Boolean(session.user.permissions?.includes('REPORTS_VIEW')))
                }
              />
              <ReportView
                rows={rows}
                range={range}
                setRange={setRange}
                query={query}
                technicians={technicians}
                technicianId={technicianId}
                setTechnicianId={setTechnicianId}
                tickets={tickets}
              />
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function SlaTable({
  rows,
  calendars,
  updateRow,
  savePolicy,
  updateCalendar,
  saveCalendar,
  addCalendar,
}: {
  rows: Row[];
  calendars: Row[];
  updateRow: (index: number, key: string, value: unknown) => void;
  savePolicy: (row: Row) => Promise<void>;
  updateCalendar: (index: number, key: string, value: unknown) => void;
  saveCalendar: (row: Row) => Promise<void>;
  addCalendar: () => void;
}) {
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Priority targets</h2>
            <p className="hint">
              Targets count only the selected calendar&apos;s working time.
              Select “Apply to open tickets” only when existing due dates should
              be recalculated.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Priority</th>
                <th>First response</th>
                <th>Resolution</th>
                <th>Warning</th>
                <th>Calendar</th>
                <th>Active</th>
                <th>Open tickets</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row.priority)}>
                  <td>
                    <strong>{priorities[String(row.priority)]}</strong>
                  </td>
                  <td>
                    <label className="compact-field">
                      <input
                        type="number"
                        min="1"
                        value={Number(row.response_minutes)}
                        onChange={(event) =>
                          updateRow(
                            index,
                            'response_minutes',
                            event.target.value,
                          )
                        }
                      />{' '}
                      minutes
                    </label>
                  </td>
                  <td>
                    <label className="compact-field">
                      <input
                        type="number"
                        min="1"
                        value={Number(row.resolution_minutes)}
                        onChange={(event) =>
                          updateRow(
                            index,
                            'resolution_minutes',
                            event.target.value,
                          )
                        }
                      />{' '}
                      minutes
                    </label>
                  </td>
                  <td>
                    <label className="compact-field">
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={Number(row.warning_percent)}
                        onChange={(event) =>
                          updateRow(
                            index,
                            'warning_percent',
                            event.target.value,
                          )
                        }
                      />{' '}
                      %
                    </label>
                  </td>
                  <td>
                    <select
                      value={String(row.calendar_id)}
                      onChange={(event) =>
                        updateRow(index, 'calendar_id', event.target.value)
                      }
                    >
                      {calendars
                        .filter(
                          (calendar) =>
                            calendar.active || calendar.id === row.calendar_id,
                        )
                        .map((calendar) => (
                          <option
                            key={String(calendar.id)}
                            value={String(calendar.id)}
                          >
                            {String(calendar.name)}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(row.active)}
                      onChange={(event) =>
                        updateRow(index, 'active', event.target.checked)
                      }
                      aria-label={`Enable ${priorities[String(row.priority)]}`}
                    />
                  </td>
                  <td>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={Boolean(row.apply_to_open)}
                        onChange={(event) =>
                          updateRow(
                            index,
                            'apply_to_open',
                            event.target.checked,
                          )
                        }
                      />{' '}
                      Apply
                    </label>
                  </td>
                  <td>
                    <button
                      className="primary"
                      onClick={() => void savePolicy(row)}
                    >
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel sla-calendar-panel">
        <div className="section-heading">
          <div>
            <h2>Business-hour calendars</h2>
            <p className="hint">
              ISO working days use 1 for Monday through 7 for Sunday. Enter one
              holiday per line as YYYY-MM-DD | Holiday name.
            </p>
          </div>
          <button className="secondary" onClick={addCalendar}>
            + Add calendar
          </button>
        </div>
        <div className="calendar-grid">
          {calendars.map((calendar, index) => (
            <article
              className="calendar-card"
              key={String(calendar.id ?? index)}
            >
              <label>
                Calendar name
                <input
                  value={String(calendar.name ?? '')}
                  onChange={(event) =>
                    updateCalendar(index, 'name', event.target.value)
                  }
                />
              </label>
              <label>
                IANA timezone
                <input
                  value={String(calendar.timezone ?? '')}
                  onChange={(event) =>
                    updateCalendar(index, 'timezone', event.target.value)
                  }
                  placeholder="Asia/Kolkata"
                />
              </label>
              <div className="form-grid">
                <label>
                  Working days
                  <input
                    value={String(calendar.working_days_text ?? '')}
                    onChange={(event) =>
                      updateCalendar(
                        index,
                        'working_days_text',
                        event.target.value,
                      )
                    }
                    placeholder="1,2,3,4,5"
                  />
                </label>
                <label>
                  Starts
                  <input
                    type="time"
                    value={String(calendar.work_start ?? '').slice(0, 5)}
                    onChange={(event) =>
                      updateCalendar(index, 'work_start', event.target.value)
                    }
                  />
                </label>
                <label>
                  Ends
                  <input
                    type="time"
                    value={String(calendar.work_end ?? '').slice(0, 5)}
                    onChange={(event) =>
                      updateCalendar(index, 'work_end', event.target.value)
                    }
                  />
                </label>
              </div>
              <label>
                Holidays
                <textarea
                  rows={4}
                  value={String(calendar.holiday_text ?? '')}
                  onChange={(event) =>
                    updateCalendar(index, 'holiday_text', event.target.value)
                  }
                  placeholder="2026-10-02 | Public holiday"
                />
              </label>
              <div className="calendar-actions">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={Boolean(calendar.active)}
                    onChange={(event) =>
                      updateCalendar(index, 'active', event.target.checked)
                    }
                  />{' '}
                  Active
                </label>
                <button
                  className="primary"
                  onClick={() => void saveCalendar(calendar)}
                >
                  Save calendar
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function ReportView({
  rows,
  range,
  setRange,
  query,
  technicians,
  technicianId,
  setTechnicianId,
  tickets,
}: {
  rows: Row[];
  range: { from: string; to: string };
  setRange: (range: { from: string; to: string }) => void;
  query: string;
  technicians: Row[];
  technicianId: string;
  setTechnicianId: (value: string) => void;
  tickets: Row[];
}) {
  return (
    <>
      <section className="panel report-controls">
        <div>
          <button className="secondary" onClick={() => setRange(weekRange())}>
            This week
          </button>
          <button className="secondary" onClick={() => setRange(monthRange())}>
            This month
          </button>
          <button className="secondary" onClick={() => setRange(lastDays(30))}>
            Last 30 days
          </button>
        </div>
        <label>
          Technician
          <select
            value={technicianId}
            onChange={(event) => setTechnicianId(event.target.value)}
          >
            <option value="">All technicians</option>
            {technicians.map((technician) => (
              <option key={String(technician.id)} value={String(technician.id)}>
                {String(technician.name)}
                {technician.active === false ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={range.from}
            onChange={(event) =>
              setRange({ ...range, from: event.target.value })
            }
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={range.to}
            onChange={(event) => setRange({ ...range, to: event.target.value })}
          />
        </label>
        <div>
          <a
            className="secondary"
            href={`/api/reports/technicians/export?${query}&format=csv`}
          >
            Export CSV
          </a>
          <a
            className="primary"
            href={`/api/reports/technicians/export?${query}&format=excel`}
          >
            Export Excel
          </a>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Technician activity</h2>
            <p className="hint">
              Assignment, transfer, work, resolution and SLA statistics for the
              selected period.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Technician</th>
                <th>Received</th>
                <th>Transferred in</th>
                <th>Transferred out</th>
                <th>Worked</th>
                <th>Resolved</th>
                <th>Open now</th>
                <th>SLA met</th>
                <th>SLA breached</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)}>
                  <td>
                    <strong>{String(row.name)}</strong>
                    <small>{String(row.email)}</small>
                  </td>
                  {[
                    'received',
                    'transferred_in',
                    'transferred_out',
                    'worked',
                    'resolved',
                    'open',
                    'sla_met',
                    'sla_breached',
                  ].map((key) => (
                    <td key={key}>{String(row[key] ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? (
            <p className="empty">No technicians or activity found.</p>
          ) : null}
        </div>
      </section>
      {technicianId ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Ticket detail</h2>
              <p className="hint">
                Tickets assigned, transferred, worked, resolved, or currently
                owned by the selected technician.
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Subject</th>
                  <th>Client / requester</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Current assignee</th>
                  <th>Resolved</th>
                  <th>SLA</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={String(ticket.id)}>
                    <td>
                      <Link href={`/admin/ticket/${ticket.id}`}>
                        {String(ticket.ticket_number)}
                      </Link>
                    </td>
                    <td>{String(ticket.subject)}</td>
                    <td>
                      <strong>{String(ticket.client_name)}</strong>
                      <small>{String(ticket.requester_name)}</small>
                    </td>
                    <td>{String(ticket.category_name ?? 'General Support')}</td>
                    <td>{priorities[String(ticket.priority)]}</td>
                    <td>{displayLabel(ticket.status)}</td>
                    <td>{String(ticket.assigned_name ?? 'Unassigned')}</td>
                    <td>{formatReportDate(ticket.resolved_at)}</td>
                    <td>{displayLabel(ticket.sla_result)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tickets.length ? (
              <p className="empty">No ticket activity found for this period.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}

const dateText = (date: Date) => date.toISOString().slice(0, 10);
function monthRange() {
  const now = new Date();
  return {
    from: dateText(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: dateText(now),
  };
}
function weekRange() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return { from: dateText(monday), to: dateText(now) };
}
function lastDays(days: number) {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - days + 1);
  return { from: dateText(from), to: dateText(now) };
}
function reportQuery(range: { from: string; to: string }, technicianId = '') {
  const end = new Date(`${range.to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  const query = new URLSearchParams({
    from: `${range.from}T00:00:00.000Z`,
    to: end.toISOString(),
  });
  if (technicianId) query.set('technicianId', technicianId);
  return query.toString();
}

function displayLabel(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatReportDate(value: unknown) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(String(value)));
}

function decorateCalendars(calendars: Row[]) {
  return calendars.map((calendar) => {
    const holidays = Array.isArray(calendar.holidays)
      ? (calendar.holidays as Row[])
      : [];
    return {
      ...calendar,
      working_days_text: Array.isArray(calendar.working_days)
        ? calendar.working_days.join(',')
        : String(calendar.working_days ?? ''),
      holiday_text: holidays
        .map(
          (holiday) =>
            `${String(holiday.date).slice(0, 10)} | ${String(holiday.name)}`,
        )
        .join('\n'),
    };
  });
}
