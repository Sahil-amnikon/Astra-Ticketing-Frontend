'use client';
import { useState } from 'react';
import Link from 'next/link';
import Dialog from '../../../components/ui/Dialog';
import UiIcon from '../../../components/ui/UiIcon';
import {
  type Ticket,
  clients,
  people,
  priorities,
  statuses,
  statusTone,
} from '../data/fixtures';

export function Status({ value }: { value: string }) {
  return <span className={`spark-status ${statusTone(value)}`}>{value}</span>;
}

export function TicketTable({
  tickets,
  onSelect,
}: {
  tickets: Ticket[];
  onSelect?: (ticket: Ticket) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="spark-ticket-table">
        <caption className="sr-only">Service desk tickets</caption>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Client / requester</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assigned to</th>
            <th>SLA</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id}>
              <td>
                <button
                  type="button"
                  className="spark-ticket-title"
                  onClick={() => onSelect?.(t)}
                >
                  <span>{t.id}</span>
                  <strong>{t.subject}</strong>
                </button>
                <small>Updated {t.updated}</small>
              </td>
              <td>
                <strong>{t.client}</strong>
                <small>{t.requester}</small>
              </td>
              <td>
                <Status value={t.status} />
              </td>
              <td>
                <span className={`spark-priority ${t.priority.toLowerCase()}`}>
                  <i />
                  {t.priority}
                </span>
              </td>
              <td>
                <span className="spark-person">
                  <span>
                    {t.assignee
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                  {t.assignee}
                </span>
              </td>
              <td>
                <Status value={t.sla} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!tickets.length && (
        <div className="spark-empty">
          <UiIcon name="search" />
          <h3>No tickets match your filters</h3>
          <p>Try another search or reset the filters.</p>
        </div>
      )}
    </div>
  );
}

export default function TicketQueue({
  tickets,
  onSelect,
  initialStatus = '',
  initialSla = '',
}: {
  tickets: Ticket[];
  onSelect: (ticket: Ticket) => void;
  initialStatus?: string;
  initialSla?: string;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState('');
  const [view, setView] = useState<'table' | 'board'>('table');
  const filtered = tickets.filter(
    (t) =>
      (!query ||
        `${t.id} ${t.subject} ${t.client} ${t.requester} ${t.assignee}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!status || t.status === status) &&
      (!priority || t.priority === priority) &&
      (!initialSla || t.sla.toUpperCase().replaceAll(' ', '_') === initialSla),
  );
  return (
    <section className="panel spark-data-panel">
      <div className="spark-table-toolbar">
        <label className="spark-search-field">
          <UiIcon name="search" />
          <input
            aria-label="Search tickets"
            placeholder="Search tickets, clients, requesters..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌕</kbd>
        </label>
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Filter priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">All priorities</option>
          {priorities.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <div className="spark-view-toggle">
          <button
            aria-label="Table view"
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
          >
            <UiIcon name="tickets" />
          </button>
          <button
            aria-label="Board view"
            aria-pressed={view === 'board'}
            onClick={() => setView('board')}
          >
            <UiIcon name="grid" />
          </button>
        </div>
      </div>
      {view === 'table' ? (
        <TicketTable tickets={filtered} onSelect={onSelect} />
      ) : (
        <div className="spark-board">
          {['New', 'Open', 'In progress', 'Waiting for client', 'Resolved'].map(
            (column) => (
              <section key={column}>
                <header>
                  <Status value={column} />
                  <span>
                    {filtered.filter((t) => t.status === column).length}
                  </span>
                </header>
                {filtered
                  .filter((t) => t.status === column)
                  .map((t) => (
                    <button
                      key={t.id}
                      className="spark-board-card"
                      onClick={() => onSelect(t)}
                    >
                      <small>{t.id}</small>
                      <strong>{t.subject}</strong>
                      <span>{t.client}</span>
                      <footer>
                        <Status value={t.priority} />
                        <span>
                          {t.assignee
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </span>
                      </footer>
                    </button>
                  ))}
              </section>
            ),
          )}
        </div>
      )}
      <footer className="spark-table-footer">
        <span>
          Showing {filtered.length} of {tickets.length} tickets
        </span>
        <button
          className="text-button"
          onClick={() => {
            setQuery('');
            setStatus('');
            setPriority('');
          }}
        >
          Reset filters
        </button>
        <span className="spark-pagination">
          <button className="secondary" disabled aria-label="Previous page">
            ‹
          </button>
          <span>1</span>
          <button className="secondary" disabled aria-label="Next page">
            ›
          </button>
        </span>
      </footer>
    </section>
  );
}

export function NewTicketDialog({
  onClose,
  onSave,
  preset = '',
}: {
  onClose: () => void;
  onSave: (
    ticket: Omit<Ticket, 'id' | 'updated' | 'requester' | 'sla' | 'status'>,
  ) => void;
  preset?: string;
}) {
  return (
    <Dialog title="Create a new ticket" onClose={onClose} wide>
      <p className="spark-form-intro">
        Tell us what needs attention. This preview saves fictional records in
        this browser session.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          onSave({
            subject: String(d.get('subject')).trim(),
            description: String(d.get('description')).trim(),
            client: String(d.get('client')),
            priority: String(d.get('priority')),
            assignee: String(d.get('assignee')),
            category: String(d.get('category')),
          });
        }}
      >
        <label className="spark-field">
          Subject
          <input
            name="subject"
            required
            maxLength={180}
            defaultValue={preset}
            placeholder="What do you need help with?"
          />
        </label>
        <div className="spark-form-grid">
          <label className="spark-field">
            Client
            <select name="client">
              {clients.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="spark-field">
            Priority
            <select name="priority" defaultValue="Medium">
              {priorities.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="spark-field">
            Category
            <select name="category">
              {[
                'Microsoft 365',
                'Network',
                'Hardware',
                'Security',
                'Other',
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="spark-field">
            Assign to
            <select name="assignee">
              {people.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="spark-field">
          Description
          <textarea
            name="description"
            rows={4}
            required
            placeholder="Include the details your team needs to get started."
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">Create ticket</button>
        </div>
      </form>
    </Dialog>
  );
}

export function TicketDetail({
  ticket,
  onClose,
  onUpdate,
}: {
  ticket: Ticket;
  onClose: () => void;
  onUpdate: (ticket: Ticket) => void;
}) {
  const [tab, setTab] = useState('Internal note');
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState<{ text: string; type: string }[]>([]);
  return (
    <Dialog title={ticket.id} onClose={onClose} wide>
      <div className="spark-detail-heading">
        <h3>{ticket.subject}</h3>
        <Status value={ticket.status} />
        <Status value={ticket.priority} />
      </div>
      <div className="spark-form-grid">
        <label className="spark-field">
          Status
          <select
            value={ticket.status}
            onChange={(e) =>
              onUpdate({
                ...ticket,
                status: e.target.value,
                updated: 'just now',
              })
            }
          >
            {statuses.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="spark-field">
          Assigned to
          <select
            value={ticket.assignee}
            onChange={(e) =>
              onUpdate({
                ...ticket,
                assignee: e.target.value,
                updated: 'just now',
              })
            }
          >
            {people.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="spark-ticket-description">
        <span className="eyebrow">
          {ticket.client} · {ticket.requester}
        </span>
        <p>{ticket.description}</p>
      </div>
      <div className="spark-tabs" role="tablist" aria-label="Reply visibility">
        {['Internal note', 'Public reply'].map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={tab === v}
            onClick={() => setTab(v)}
          >
            {v}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) {
            setNotes([...notes, { text: note.trim(), type: tab }]);
            setNote('');
          }
        }}
      >
        <label className="spark-field">
          {tab === 'Internal note'
            ? 'Only visible to the service team'
            : 'Visible to the requester'}
          <textarea
            value={note}
            required
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              tab === 'Internal note'
                ? 'Add an internal work note...'
                : 'Write a reply to the requester...'
            }
          />
        </label>
        <button className="primary">
          {tab === 'Internal note' ? 'Add note' : 'Add sample reply'}
        </button>
      </form>
      <div className="spark-activity">
        <h3>Activity</h3>
        {notes.toReversed().map((n, i) => (
          <article key={i}>
            <span className="avatar">JC</span>
            <div>
              <strong>
                Jamie Carter <Status value={n.type} />
              </strong>
              <small>Just now · Sample activity</small>
              <p>{n.text}</p>
            </div>
          </article>
        ))}
        <article>
          <span className="avatar">JC</span>
          <div>
            <strong>Ticket assigned to {ticket.assignee}</strong>
            <small>Today · Sample activity</small>
            <p>
              We have received the request and are reviewing the next steps.
            </p>
          </div>
        </article>
      </div>
      <Link
        className="spark-inline-link"
        href="/ui-preview?module=tickets"
        onClick={onClose}
      >
        ← Back to ticket queue
      </Link>
    </Dialog>
  );
}
