'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Row, Request } from './record-form';
import './site-domains.css';
type Domain = {
  id: string;
  client_id: string;
  domain: string;
  site_id: string | null;
  active: boolean;
  revision: number;
};
type Data = {
  domains: Domain[];
  emailEnabled: boolean;
  emailConfigured: boolean;
};
export default function SiteDomains({
  site,
  request,
  revision,
  onChanged,
  onClose,
}: {
  site: Row;
  request: Request;
  revision: number;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Domain>();
  const [domain, setDomain] = useState('');
  const [active, setActive] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setData(undefined);
      setError('');
      void request(
        `/admin/client-domains?siteId=${encodeURIComponent(String(site.id))}`,
      )
        .then((result) => {
          if (live) setData(result as Data);
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [site.id, request, revision, refresh]);
  const eligible =
    site.active !== false &&
    site.organization_type === 'CLIENT' &&
    site.client_status === 'ACTIVE';
  const prefix = String(site.ticket_prefix ?? '');
  function reset() {
    setEditing(undefined);
    setDomain('');
    setActive(true);
  }
  return (
    <section
      className="panel site-domain-panel"
      aria-label={`Email domains for ${site.name}`}
    >
      <div className="site-domain-heading">
        <div>
          <p className="eyebrow">CUSTOMERS / SITES / DOMAIN ROUTING</p>
          <h2>Email domains for {String(site.name)}</h2>
          <p>
            {String(site.client_name)} · Cases from these domains route to this
            site.
          </p>
        </div>
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={onClose}
        >
          Close domain routing
        </button>
      </div>
      <div className="site-domain-flow">
        <span>Verified customer email</span>
        <b aria-hidden="true">→</b>
        <span>
          {String(site.client_name)} / {String(site.name)}
        </span>
        <b aria-hidden="true">→</b>
        <span>
          Tickets · {prefix ? `${prefix}-000123` : 'automatic site numbering'}
        </span>
      </div>
      <p className="hint">
        Add every customer-owned domain and subdomain separately. Each exact
        domain maps to one customer and site. Ticket numbers use this site’s
        prefix and sequence automatically; the number above is an example.
      </p>
      {error ? (
        <p role="alert" className="notice error">
          {error}{' '}
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => setRefresh((r) => r + 1)}
          >
            Reload domains
          </button>
        </p>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {!eligible ? (
        <p className="notice">
          Domain routing requires an active site under an active customer
          organization. Review this site and its customer before adding domains.
        </p>
      ) : null}
      {data && (!data.emailEnabled || !data.emailConfigured) ? (
        <p className="notice">
          Email verification needs enabled SMTP. Configure it under{' '}
          <Link href="/admin/email">Email administration</Link>.
        </p>
      ) : null}
      <form
        className="site-domain-form"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setNotice('');
          void request(
            editing
              ? `/admin/client-domains/${editing.id}`
              : '/admin/client-domains',
            {
              method: editing ? 'PATCH' : 'POST',
              body: JSON.stringify({
                clientId: String(site.client_id),
                siteId: String(site.id),
                domain,
                active,
                revision: editing?.revision,
              }),
            },
          )
            .then(() => {
              reset();
              setNotice(
                'Domain saved. New portal cases will follow this site routing.',
              );
              onChanged();
              setRefresh((r) => r + 1);
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <h3>{editing ? 'Edit domain' : 'Add a domain to this site'}</h3>
        <div className="site-domain-fields">
          <label htmlFor="site-email-domain">
            Domain name
            <input
              id="site-email-domain"
              required
              maxLength={253}
              placeholder="company.example"
              value={domain}
              disabled={busy || !eligible}
              onChange={(e) => setDomain(e.target.value)}
            />
          </label>
          <label className="site-domain-checkbox">
            <input
              type="checkbox"
              checked={active}
              disabled={busy || !eligible}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span>Enable portal verification and routing</span>
          </label>
          <button
            className="primary"
            disabled={busy || loading || !data || !eligible}
          >
            {busy ? 'Saving…' : editing ? 'Save domain changes' : 'Add domain'}
          </button>
          {editing ? (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={reset}
            >
              Cancel domain edit
            </button>
          ) : null}
        </div>
      </form>
      <div className="site-domain-list">
        <h3>
          Configured domains{' '}
          {data ? <small>({data.domains.length})</small> : null}
        </h3>
        {loading ? (
          <p role="status">Loading site domains…</p>
        ) : data?.domains.length ? (
          data.domains.map((rule) => (
            <article key={rule.id}>
              <div>
                <strong>{rule.domain}</strong>
                <span
                  className={
                    rule.active ? 'site-domain-enabled' : 'site-domain-disabled'
                  }
                >
                  {rule.active ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <button
                type="button"
                className="secondary"
                aria-label={`Edit domain ${rule.domain}`}
                disabled={busy}
                onClick={() => {
                  setEditing(rule);
                  setDomain(rule.domain);
                  setActive(rule.active);
                  setError('');
                  setNotice('');
                }}
              >
                Edit domain
              </button>
            </article>
          ))
        ) : data ? (
          <p className="empty">No domains are assigned to this site yet.</p>
        ) : null}
      </div>
      <p className="hint">
        Disabling or changing a domain expires its email-verification portal
        sessions and keeps submitted tickets. Share the{' '}
        <Link href="/support" target="_blank" rel="noopener">
          customer support portal
        </Link>{' '}
        with your users. Signed-in customer accounts keep their existing
        customer and site access limits.
      </p>
      <Link
        className="secondary"
        href={`/admin/tickets?clientId=${encodeURIComponent(String(site.client_id))}&siteId=${encodeURIComponent(String(site.id))}`}
      >
        View tickets for this site →
      </Link>
    </section>
  );
}
