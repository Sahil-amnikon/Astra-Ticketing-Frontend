'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { BrandLogo } from '../../../components/ui/BrandMark';

export default function LoginScreen({
  title = 'Welcome back',
  detail = 'Sign in to continue to your ASTRA workspace.',
  eyebrow = 'ASTRA TICKETING SYSTEM',
  error,
  signInHref = '/api/auth/login?returnTo=/',
  preview = false,
  localAuth = false,
  onLocalLogin,
}: {
  title?: string;
  detail?: string;
  eyebrow?: string;
  error?: string;
  signInHref?: string;
  preview?: boolean;
  localAuth?: boolean;
  onLocalLogin?: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitLocal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onLocalLogin || submitting) return;

    setSubmitting(true);
    setLocalError('');
    try {
      await onLocalLogin(username, password);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : 'Local sign-in failed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="astra-login spark-login-page">
      <div className="spark-login-container">
        <section className="astra-login-hero" aria-label="Welcome to ASTRA">
          <div className="spark-login-orbit spark-login-orbit-one" />
          <div className="spark-login-orbit spark-login-orbit-two" />
          <div className="astra-login-intro">
            <div className="astra-login-logo">
              <BrandLogo />
            </div>
            <span className="spark-login-kicker">
              YOUR SERVICE DESK, CONNECTED
            </span>
            <h2>
              Great support.
              <br />
              One workspace.
            </h2>
            <p>
              Bring your people, conversations and service operations together
              with ASTRA.
            </p>
            <div className="spark-login-features">
              <span>✓ One connected service desk</span>
              <span>✓ Clear priorities. Faster resolutions.</span>
              <span>✓ Secure access for every team</span>
            </div>
          </div>
          <small>ASTRA · Amnikon Technologies</small>
        </section>
        <main className="astra-login-main">
          <div className="astra-login-card">
            <BrandLogo className="astra-login-small-logo" />
            <div className="eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            <p>{detail}</p>
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            {localAuth && onLocalLogin && (
              <form className="mt-6 space-y-4" onSubmit={submitLocal}>
                <div>
                  <label
                    htmlFor="astra-local-username"
                    className="mb-1 block text-sm font-semibold text-slate-700"
                  >
                    Local username
                  </label>
                  <input
                    id="astra-local-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="astra-local-password"
                    className="mb-1 block text-sm font-semibold text-slate-700"
                  >
                    Local password
                  </label>
                  <input
                    id="astra-local-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                {localError && (
                  <div className="notice error" role="alert">
                    {localError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Signing in…' : 'Sign in locally'}
                </button>
                <p className="text-xs text-slate-500">
                  Development-only account for local testing.
                </p>
              </form>
            )}
            <Link
              prefetch={false}
              className="microsoft-button astra-sign-in"
              href={signInHref}
            >
              <span className="ms-icon" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>
                {preview ? 'Explore the UI preview' : 'Sign in with Microsoft'}
              </span>
              <span aria-hidden="true">→</span>
            </Link>
            <div className="astra-login-divider">
              <span>
                {preview ? 'SAMPLE DATA PREVIEW' : 'SECURE WORKSPACE ACCESS'}
              </span>
            </div>
            <p>
              <Link
                className="support-inline-link"
                href={preview ? '/ui-preview?module=support' : '/support'}
              >
                Need help? Contact your service desk →
              </Link>
            </p>
            <small>
              {preview
                ? 'Explore the design using fictional sample records. Live sign-in and data remain separate.'
                : 'Use your organisation’s Microsoft account. Your approved access determines your workspaces.'}
            </small>
          </div>
          <small className="astra-login-footer">
            © {new Date().getFullYear()} Amnikon Technologies. All rights
            reserved.
          </small>
        </main>
      </div>
    </div>
  );
}
