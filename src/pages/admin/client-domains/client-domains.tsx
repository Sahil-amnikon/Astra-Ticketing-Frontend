'use client';
import { hasFullAccess } from '../../role-access';

import Link from '../../../navigation/link';
import { useEffect, useState } from 'react';
import { useWorkspace, WorkspaceFrame } from '../../workspace-tools';
type Rule = {
  id: string;
  client_id: string;
  client_name: string;
  ticket_prefix: string;
  domain: string;
  site_id: string | null;
  site_name: string | null;
  active: boolean;
  revision: number;
};
type Data = {
  domains: Rule[];
  clients: { id: string; name: string; ticket_prefix: string }[];
  sites: { id: string; name: string; client_id: string }[];
  emailEnabled: boolean;
  emailConfigured: boolean;
};
export default function ClientDomains() {
  const w = useWorkspace();
  const { session, request, revision, setError } = w;
  const [data, setData] = useState<Data>();
  const [editing, setEditing] = useState<Rule>();
  const [client, setClient] = useState('');
  const [domain, setDomain] = useState('');
  const [site, setSite] = useState('');
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!hasFullAccess(session?.user.roles)) return;
    let live = true;
    void request<Data>('/admin/client-domains')
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [session, request, revision, setError]);
  function reset() {
    setEditing(undefined);
    setDomain('');
    setSite('');
    setActive(true);
  }
  return (
    <WorkspaceFrame
      title="Client support portal"
      description="Let client users submit tickets with a verified work email. Multiple domains can route to the same client."
      user={session?.user}
      csrfToken={session?.csrfToken}
      error={w.error}
      notice={w.notice}
    >
      {!hasFullAccess(session?.user.roles) ? (
        <p>Open the Administration workspace to configure client domains.</p>
      ) : (
        <>
          <section className="panel v38-stack">
            <h2>Email-verified ticket intake</h2>
            <p>
              Share{' '}
              <Link
                className="support-inline-link"
                href="/support"
                target="_blank"
                rel="noopener"
              >
                Open client support portal ↗
              </Link>{' '}
              with your clients. Each exact domain maps to one client and its
              selected site ticket prefix. Add every client-owned domain and
              subdomain separately.
            </p>
            <p>
              Only enable a domain after confirming with the client that its
              users should receive support. Shared personal email provider
              domains are not supported.
            </p>
            {(data && !data.emailEnabled) || (data && !data.emailConfigured) ? (
              <p className="support-note">
                Configure and enable SMTP in{' '}
                <Link href="/admin/email">Email administration</Link> before
                requesting verification codes.
              </p>
            ) : null}
            <p className="support-muted">
              Department selection remains part of the existing internal ticket
              workflow. Client requests are routed by client and, optionally,
              site.
            </p>
          </section>
          <form
            className="panel v38-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void w
                .save(
                  editing
                    ? `/admin/client-domains/${editing.id}`
                    : '/admin/client-domains',
                  {
                    clientId: client,
                    domain: domain.trim().replace(/^@/, '').toLowerCase(),
                    siteId: site || null,
                    active,
                    revision: editing?.revision,
                  },
                  editing ? 'PATCH' : 'POST',
                )
                .then(() => reset())
                .catch(() => {});
            }}
          >
            <h2>
              {editing ? 'Edit domain routing' : 'Add a client email domain'}
            </h2>
            <div className="support-field-row">
              <label>
                Client
                <select
                  required
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value);
                    setSite('');
                  }}
                  disabled={!!editing}
                >
                  <option value="">Select client</option>
                  {data?.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.ticket_prefix}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Email domain
                <input
                  required
                  placeholder="example.com"
                  maxLength={254}
                  aria-describedby="client-email-domain-help"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
                <small id="client-email-domain-help" className="hint">
                  Enter example.com or @example.com.
                </small>
              </label>
              <label>
                Default site
                <select value={site} onChange={(e) => setSite(e.target.value)}>
                  <option value="">Requester can select a client site</option>
                  {data?.sites
                    .filter((s) => s.client_id === client)
                    .map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label className="support-checkbox">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Allow email verification and ticket submission
            </label>
            <div className="support-actions">
              <button className="primary" disabled={w.busy || !data}>
                {w.busy ? 'Saving…' : 'Save domain'}
              </button>
              {editing ? (
                <button type="button" className="secondary" onClick={reset}>
                  Cancel editing
                </button>
              ) : null}
            </div>
            <p className="support-muted">
              Disabling or editing a domain expires its existing portal
              sessions. Previously submitted tickets are retained.
            </p>
          </form>
          <section className="panel">
            <h2>Configured domains</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Client</th>
                    <th>Ticket prefix</th>
                    <th>Site</th>
                    <th>Access</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.domains.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.domain}</strong>
                      </td>
                      <td>{r.client_name}</td>
                      <td>{r.ticket_prefix}</td>
                      <td>{r.site_name ?? 'Client sites'}</td>
                      <td>{r.active ? 'Enabled' : 'Disabled'}</td>
                      <td>
                        <button
                          className="secondary"
                          onClick={() => {
                            setEditing(r);
                            setClient(r.client_id);
                            setDomain(r.domain);
                            setSite(r.site_id ?? '');
                            setActive(r.active);
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && !data.domains.length ? (
              <p>
                No domains are configured yet. Add the first client domain
                above.
              </p>
            ) : null}
          </section>
        </>
      )}
    </WorkspaceFrame>
  );
}
