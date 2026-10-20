'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import BrandMark from '../brand-mark';
type Options = {
  email: string;
  csrfToken: string;
  client: { name: string; ticketPrefix: string };
  fixedSiteId: string | null;
  categories: { id: string; name: string }[];
  sites: { id: string; name: string; ticket_prefix?: string }[];
};
export default function SupportPortal() {
  const [options, setOptions] = useState<Options>();
  const [email, setEmail] = useState('');
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [requestId, setRequestId] = useState('');
  const [ticket, setTicket] = useState<{ id: string; ticket_number: string }>();
  const request = useCallback(
    async <T,>(path: string, body?: unknown, csrf?: string): Promise<T> => {
      const response = await fetch(`/api/support/${path}`, {
        method: body ? 'POST' : 'GET',
        cache: 'no-store',
        headers: body
          ? {
              'content-type': 'application/json',
              ...(csrf ? { 'x-csrf-token': csrf } : {}),
            }
          : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json();
      if (response.status === 401) {
        setOptions(undefined);
        setChallenge('');
        setNotice('');
      }
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Your verification session has expired. Verify your email again.'
            : response.status === 429
              ? 'Please wait before trying again.'
              : (data.error?.message ??
                'Unable to complete your request. Please try again.'),
        );
      return data as T;
    },
    [],
  );
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => {
      if (live) setRequestId(crypto.randomUUID());
    });
    void Promise.resolve()
      .then(() => request<Options>('options'))
      .then((o) => {
        if (live) setOptions(o);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [request]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function run(action: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sendCode() {
    await run(async () => {
      const r = await request<{ challenge: string; message: string }>('code', {
        email,
      });
      setChallenge(r.challenge);
      setCode('');
      setNotice(r.message);
      setCooldown(60);
    });
  }
  return (
    <div className="support-portal">
      <header className="support-header">
        <Link href="/support" className="support-brand">
          <BrandMark />
          <span>
            <strong>ASTRA</strong>
            <small>Client support</small>
          </span>
        </Link>
        <Link href="/">Staff sign in</Link>
      </header>
      <main className="support-main">
        <aside className="support-intro">
          <span className="support-eyebrow">YOUR SERVICE DESK</span>
          <h1>
            A simpler way
            <br />
            to get support.
          </h1>
          <p>
            Tell us what you need. Your service desk will receive the request
            and help you get back to work.
          </p>
          <ol>
            <li>
              <strong>Verify your work email</strong>
              <span>Use the code delivered to your inbox.</span>
            </li>
            <li>
              <strong>Describe your issue</strong>
              <span>Your company is selected automatically.</span>
            </li>
            <li>
              <strong>Receive your ticket number</strong>
              <span>Use it when following up with your service desk.</span>
            </li>
          </ol>
        </aside>
        <section className="panel support-card" aria-labelledby="support-title">
          {ticket ? (
            <>
              <span className="support-success-icon" aria-hidden="true">
                ✓
              </span>
              <h2 id="support-title">Your request has been sent</h2>
              <p>
                Your service desk has received your ticket for{' '}
                <strong>{options?.client.name}</strong>.
              </p>
              <div className="support-ticket-number">
                <small>Ticket number</small>
                <strong>{ticket.ticket_number}</strong>
              </div>
              <p>
                Keep this number for reference. Replies from your service desk
                will use your verified email.
              </p>
              <button
                onClick={() => {
                  setTicket(undefined);
                  setRequestId(crypto.randomUUID());
                }}
              >
                Submit another request
              </button>
            </>
          ) : options ? (
            <>
              <span className="support-eyebrow">
                STEP 2 · SUBMIT YOUR REQUEST
              </span>
              <h2 id="support-title">How can we help?</h2>
              <div className="support-verified">
                <strong>{options.client.name}</strong>
                <span>{options.email} · Verified</span>
              </div>
              <form
                className="v38-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    const result = await request<{
                      id: string;
                      ticket_number: string;
                    }>(
                      'tickets',
                      {
                        requestId,
                        name: f.get('name'),
                        categoryId: f.get('categoryId'),
                        ...(f.get('siteId') ? { siteId: f.get('siteId') } : {}),
                        subject: f.get('subject'),
                        description: f.get('description'),
                      },
                      options.csrfToken,
                    );
                    setTicket(result);
                    setNotice('');
                  });
                }}
              >
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="First and last name"
                  />
                </label>
                <div className="support-field-row">
                  <label>
                    Category
                    <select name="categoryId" required defaultValue="">
                      <option value="" disabled>
                        Select a category
                      </option>
                      {options.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {options.sites.length > 0 ? (
                    <label>
                      Site
                      <select
                        name="siteId"
                        defaultValue={options.fixedSiteId ?? ''}
                        disabled={!!options.fixedSiteId}
                      >
                        <option value="">Select a site (optional)</option>
                        {options.sites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <label>
                  Subject
                  <input
                    name="subject"
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="A short summary of the issue"
                  />
                </label>
                <label>
                  Describe your issue
                  <textarea
                    name="description"
                    required
                    minLength={3}
                    maxLength={10000}
                    rows={5}
                    placeholder="What happened? When did it start? Include any error messages and the effect on your work. Please leave out passwords."
                  />
                </label>
                <p className="support-muted">
                  Your ticket will be routed to {options.client.name}.{' '}
                  {options.fixedSiteId ? (
                    <>
                      {options.client.ticketPrefix} is the assigned site’s
                      ticket prefix.
                    </>
                  ) : (
                    <>
                      Each selected site uses its own prefix; requests without a
                      site use {options.client.ticketPrefix}.
                    </>
                  )}
                </p>
                <button disabled={busy || !requestId}>
                  {busy ? 'Sending…' : 'Send support request →'}
                </button>
              </form>
              <button
                className="support-text-button"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    await request('logout', {}, options.csrfToken);
                    setOptions(undefined);
                    setChallenge('');
                    setNotice('');
                    setEmail('');
                  });
                }}
              >
                Use a different email
              </button>
            </>
          ) : (
            <>
              <span className="support-eyebrow">
                STEP 1 · VERIFY YOUR EMAIL
              </span>
              <h2 id="support-title">Welcome to client support</h2>
              <p>
                Use your work email so we can send your request to the right
                company.
              </p>
              {!challenge ? (
                <form
                  className="v38-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendCode();
                  }}
                >
                  <label>
                    Work email address
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      maxLength={254}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@yourcompany.com"
                    />
                  </label>
                  <button disabled={busy || cooldown > 0}>
                    {busy ? 'Sending code…' : 'Send verification code →'}
                  </button>
                </form>
              ) : (
                <>
                  <p className="support-email-display">
                    Code requested for <strong>{email}</strong>
                  </p>
                  <form
                    className="v38-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await request('verify', { challenge, code });
                        setOptions(await request<Options>('options'));
                        setNotice('');
                      });
                    }}
                  >
                    <label>
                      Six-digit verification code
                      <input
                        className="support-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={code}
                        onChange={(e) =>
                          setCode(e.target.value.replace(/\D/g, ''))
                        }
                        placeholder="000000"
                      />
                    </label>
                    <p className="support-muted">
                      The code expires in 10 minutes.
                    </p>
                    <button disabled={busy || code.length !== 6}>
                      {busy ? 'Verifying…' : 'Verify and continue →'}
                    </button>
                  </form>
                  <div className="support-resend">
                    <button
                      className="support-text-button"
                      disabled={busy || cooldown > 0}
                      onClick={() => {
                        void sendCode();
                      }}
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </button>
                    <button
                      className="support-text-button"
                      disabled={busy}
                      onClick={() => {
                        setChallenge('');
                        setNotice('');
                        setCode('');
                      }}
                    >
                      Change email
                    </button>
                  </div>
                </>
              )}
              <div className="support-note">
                No Microsoft account is required. Your organization must have
                its email domain enabled by your service desk.
              </div>
            </>
          )}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="support-note" role="status">
              {notice}
            </p>
          ) : null}
        </section>
      </main>
      <footer className="support-footer">
        ASTRA Ticketing System · Secure client support
      </footer>
    </div>
  );
}
