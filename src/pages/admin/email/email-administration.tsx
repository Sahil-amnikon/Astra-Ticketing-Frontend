'use client';
import { hasFullAccess } from '../../role-access';

import { useEffect, useState } from 'react';
import {
  WorkspaceFrame,
  useWorkspace,
  field,
  optionalField,
} from '../../workspace-tools';
type Settings = {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  tlsMode: string;
  smtpUsername: string;
  passwordSaved: boolean;
  ticketAddress: string;
  changeAddress: string;
  inboundProvider: string;
  encryptionReady: boolean;
  inboundSince?: string;
};
type Delivery = {
  id: string;
  direction: string;
  channel: string;
  subject: string;
  state: string;
  attempts: number;
  last_error_code?: string;
  created_at: string;
};
type Review = Delivery & {
  sender_address: string; body: string;
  attachments?: { id: string; file_name: string }[];
  attachment_warnings?: string[];
};
type TicketOption = { id: string; ticket_number: string; subject: string };
type ChangeOption = { id: string; change_number: string; title: string };
type IntakeOption = { id: string; name: string; client_id?: string; email?: string };
type IntakeOptions = { clients: IntakeOption[]; contacts: IntakeOption[]; sites: IntakeOption[]; categories: IntakeOption[] };
export default function EmailAdministration() {
  const w = useWorkspace();
  const { request, session, revision, setError } = w;
  const [settings, setSettings] = useState<Settings>();
  const [status, setStatus] = useState<{
    messages: Delivery[];
    sync: {
      mailbox: string;
      last_sync_at?: string;
      last_error_code?: string;
    }[];
  }>();
  const [review, setReview] = useState<Review>();
  const [intakeOptions, setIntakeOptions] = useState<IntakeOptions>();
  const [intakeClient, setIntakeClient] = useState('');
  const [records, setRecords] = useState<{
    tickets: TicketOption[];
    changes: ChangeOption[];
  }>({ tickets: [], changes: [] });
  useEffect(() => {
    if (!hasFullAccess(session?.user.roles)) return;
    let live = true;
    void Promise.all([
      request<Settings>('/admin/email'),
      request<typeof status>('/admin/email/status'),
    ])
      .then(([s, d]) => {
        if (live) {
          setSettings(s);
          setStatus(d);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [session, request, revision, setError]);
  async function openReview(id: string) {
    try {
      const [r, t, c, options] = await Promise.all([
        request<Review>(`/mail/review/${id}`),
        request<{ items: TicketOption[] }>('/tickets?pageSize=100'),
        request<{ items: ChangeOption[] }>('/changes?pageSize=100'),
        request<IntakeOptions>('/tickets/options'),
      ]);
      setReview(r);
      setRecords({ tickets: t.items, changes: c.items });
      setIntakeOptions(options);
      setIntakeClient('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <WorkspaceFrame
      title="Email administration"
      description="Configure internal ticket email, mailbox replies and messages that need review. CAB email is disabled."
      user={session?.user}
      csrfToken={session?.csrfToken}
      error={w.error}
      notice={w.notice}
    >
      {!hasFullAccess(session?.user.roles) ? (
        <p>Administrator access is required.</p>
      ) : (
        <>
          {settings ? (
            <form
              className="panel v38-stack"
              key={`settings-${revision}`}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void w
                  .save(
                    '/admin/email',
                    {
                      enabled: f.has('enabled'),
                      smtpHost: field(f, 'host'),
                      smtpPort: Number(field(f, 'port')),
                      tlsMode: field(f, 'tls'),
                      smtpUsername: field(f, 'username'),
                      password: optionalField(f, 'password'),
                      ticketAddress: field(f, 'ticket'),
                      changeAddress: field(f, 'change'),
                      inboundProvider: field(f, 'inbound'),
                    },
                    'PATCH',
                  )
                  .catch(() => {});
              }}
            >
              <h2>Mail connections</h2>
              {!settings.encryptionReady ? (
                <div className="notice error">
                  Ask your administrator to configure the email encryption key
                  before saving credentials.
                </div>
              ) : null}
              <div className="v38-form-grid">
                <label>
                  SMTP server
                  <input
                    name="host"
                    required
                    defaultValue={settings.smtpHost}
                    maxLength={253}
                    list="smtp-hosts"
                    placeholder="smtp.your-provider.com"
                    autoComplete="off"
                  />
                  <datalist id="smtp-hosts">
                    {[
                      'mail.smtp2go.com',
                      'mail-us.smtp2go.com',
                      'mail-eu.smtp2go.com',
                      'mail-eu2.smtp2go.com',
                      'mail-au.smtp2go.com',
                      'smtp.office365.com',
                      'smtp.gmail.com',
                      'smtp.sendgrid.net',
                    ].map((h) => (
                      <option key={h} value={h} />
                    ))}
                  </datalist>
                  <small className="hint">
                    Choose a suggestion or enter your provider’s SMTP hostname.
                    Changing provider or username requires its password.
                  </small>
                </label>
                <label>
                  Port
                  <select name="port" defaultValue={settings.smtpPort}>
                    <option>587</option>
                    <option>2525</option>
                    <option>465</option>
                  </select>
                </label>
                <label>
                  Encryption
                  <select name="tls" defaultValue={settings.tlsMode}>
                    <option>STARTTLS</option>
                    <option>TLS</option>
                  </select>
                </label>
                <label>
                  SMTP username
                  <input
                    name="username"
                    autoComplete="off"
                    defaultValue={settings.smtpUsername}
                    maxLength={300}
                  />
                </label>
                <label>
                  SMTP password
                  <input
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    maxLength={1000}
                    placeholder={
                      settings.passwordSaved
                        ? 'Saved — leave blank to retain'
                        : 'Enter SMTP password'
                    }
                  />
                </label>
                <label>
                  Ticket mailbox
                  <input
                    type="email"
                    required
                    name="ticket"
                    defaultValue={settings.ticketAddress}
                  />
                </label>
                <input
                  type="hidden"
                  name="change"
                  value={settings.changeAddress}
                />
                <label>
                  Incoming mailbox connection
                  <select
                    name="inbound"
                    defaultValue={settings.inboundProvider}
                  >
                    <option value="DISABLED">Disabled</option>
                    <option value="MICROSOFT_365">Microsoft 365 / Graph</option>
                  </select>
                </label>
              </div>
              <p>
                Use STARTTLS with port 587 or 2525, or TLS with 465. Verify the
                ticket sender with your SMTP provider. Email goes only to the
                assigned technician, client-scoped team leads and
                administrators. CAB never sends email.
              </p>
              <p>
                Incoming processing starts when enabled. Mail from one active
                client contact creates a ticket; authenticated replies with a
                matching thread appear in staff history. Ambiguous mail goes to
                review. Email replies never approve a change.
              </p>
              <label className="v38-check">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={settings.enabled}
                />
                Enable outgoing email
              </label>
              <button disabled={w.busy} className="primary">
                Save settings
              </button>
              <div className="v38-row">
                <button
                  type="button"
                  className="secondary"
                  disabled={w.busy}
                  onClick={() =>
                    void w
                      .save('/admin/email/verify', {})
                      .then((r) =>
                        w.setNotice((r as { message: string }).message),
                      )
                      .catch(() => {})
                  }
                >
                  Verify SMTP connection
                </button>
                <button
                  className="secondary"
                  disabled={w.busy || !settings.enabled}
                  type="button"
                  onClick={() =>
                    void w
                      .save('/admin/email/test', { channel: 'TICKET' })
                      .then((r) =>
                        w.setNotice(
                          `Test queued to ${(r as { recipient: string }).recipient}. Check delivery below.`,
                        ),
                      )
                      .catch(() => {})
                  }
                >
                  Send ticket test to me
                </button>
              </div>
            </form>
          ) : (
            <p>Loading email settings…</p>
          )}
          {review ? (
            <section className="panel v38-stack">
              <div className="v38-row">
                <h2>Review message</h2>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setReview(undefined)}
                >
                  Close
                </button>
              </div>
              <strong>{review.subject}</strong>
              <p>
                {review.sender_address} · {review.state}
              </p>
              <p className="v38-prewrap">{review.body}</p>
              {review.attachments?.length ? <div className="v38-row" aria-label="Email attachments">
                {review.attachments.map((file) => <a key={file.id} className="secondary mail-attachment" href={`/api/mail/attachments/${file.id}`}>{file.file_name}</a>)}
              </div> : null}
              {review.attachment_warnings?.map((warning) => <p key={warning} role="status" className="notice">{warning}</p>)}
              <form
                className="v38-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void w
                    .save(`/mail/review/${review.id}`, {
                      action: field(f, 'action'),
                      recordId: optionalField(f, 'recordId'),
                      reason: field(f, 'reason'),
                    })
                    .then(() => setReview(undefined))
                    .catch(() => {});
                }}
              >
                {review.direction === 'OUTBOUND' ? (
                  <>
                    <p>
                      Retry only after checking your SMTP provider’s delivery
                      logs. An uncertain message may already have been
                      delivered; retrying can send a duplicate.
                    </p>
                    <input type="hidden" name="action" value="RETRY" />
                  </>
                ) : (
                  <>
                    <label>
                      Action
                      <select name="action">
                        <option value="IGNORE">Ignore this message</option>
                        <option value={review.channel}>
                          Attach to a {review.channel.toLowerCase()}
                        </option>
                      </select>
                    </label>
                    <label>
                      Existing record
                      <select name="recordId">
                        <option value="">Choose a record to attach</option>
                        {review.channel === 'TICKET'
                          ? records.tickets.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.ticket_number} — {t.subject}
                              </option>
                            ))
                          : records.changes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.change_number} — {c.title}
                              </option>
                            ))}
                      </select>
                    </label>
                  </>
                )}
                <label>
                  Review reason
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    name="reason"
                  />
                </label>
                <button disabled={w.busy} className="primary">
                  {review.direction === 'OUTBOUND'
                    ? 'Queue retry'
                    : 'Record decision'}
                </button>
              </form>
              {review.direction === 'INBOUND' && review.channel === 'TICKET' && review.state === 'REVIEW' && intakeOptions ? (
                <details>
                  <summary>Create a ticket from this email</summary>
                  <p>Confirm the sender before creating a ticket. Choose a contact whose email matches this message.</p>
                  <form className="v38-stack" onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void w.save(`/mail/intake/${review.id}`, {
                      clientId: intakeClient, requesterId: field(f, 'requester'),
                      categoryId: field(f, 'category'), siteId: optionalField(f, 'site'),
                    }).then((result) => {
                      w.setNotice(`Ticket ${(result as { ticket_number: string }).ticket_number} created from the reviewed email.`);
                      setReview(undefined);
                    }).catch(() => {});
                  }}>
                    <label>Client<select required value={intakeClient} onChange={(e) => setIntakeClient(e.target.value)}>
                      <option value="">Choose a client</option>
                      {intakeOptions.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select></label>
                    <label>Matching requester<select key={intakeClient} name="requester" required>
                      <option value="">Choose the sender's contact</option>
                      {intakeOptions.contacts.filter((item) => item.client_id === intakeClient && item.email?.toLowerCase() === review.sender_address.toLowerCase()).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select></label>
                    <label>Site<select key={`site-${intakeClient}`} name="site">
                      <option value="">Use the contact's site</option>
                      {intakeOptions.sites.filter((item) => item.client_id === intakeClient).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select></label>
                    <label>Category<select name="category" required>
                      <option value="">Choose a category</option>
                      {intakeOptions.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select></label>
                    <button className="primary" disabled={w.busy}>Create ticket</button>
                  </form>
                </details>
              ) : null}
            </section>
          ) : null}
          <section className="panel v38-stack">
            <div className="v38-row">
              <h2>Delivery and reply processing</h2>
              <button className="secondary" type="button" onClick={w.refresh}>
                Refresh
              </button>
            </div>
            {status?.sync.map((s) => (
              <p key={s.mailbox}>
                {s.mailbox}:{' '}
                {s.last_sync_at
                  ? new Date(s.last_sync_at).toLocaleString()
                  : 'Not synchronized'}{' '}
                {s.last_error_code ?? ''}
              </p>
            ))}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Message</th>
                    <th>State</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {status?.messages.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.created_at).toLocaleString()}</td>
                      <td>
                        {m.direction} · {m.channel}
                        <br />
                        {m.subject}
                      </td>
                      <td>{m.state}</td>
                      <td>
                        {m.last_error_code?.replaceAll('_', ' ')}
                        {['REVIEW', 'FAILED', 'UNKNOWN'].includes(m.state) ? (
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => void openReview(m.id)}
                          >
                            Review
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!status?.messages.length ? (
              <p>
                No email activity yet. Enabling email affects future replies and
                queued tests.
              </p>
            ) : null}
          </section>
        </>
      )}
    </WorkspaceFrame>
  );
}
