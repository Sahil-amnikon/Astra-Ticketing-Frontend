'use client';
import { hasFullAccess } from './role-access';


import { useEffect, useState } from 'react';
import { uiLabel } from './ui-label';
import Link from '../navigation/link';
import { useRouter } from '../navigation/hooks';
import BrandMark, { BrandLogo } from './brand-mark';
import UiIcon from './ui-icon';
import { signOutSession } from './auth-logout';

interface UserView {
  displayName: string;
  email: string;
  roles: string[];
  changeAccess?: string;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; user: UserView; csrfToken: string }
  | { kind: 'error' };

type Portal = 'home' | 'client' | 'operations';

const portalCopy: Record<
  Portal,
  { eyebrow: string; title: string; detail: string }
> = {
  home: {
    eyebrow: 'ASTRA TICKETING SYSTEM',
    title: 'Welcome back',
    detail: 'Sign in to continue to your ASTRA workspace.',
  },
  client: {
    eyebrow: 'CLIENT & USER PORTAL',
    title: 'Sign in for IT support',
    detail: 'For approved client users who need help from their service desk.',
  },
  operations: {
    eyebrow: 'TECHNICIAN & ADMINISTRATION',
    title: 'Sign in for service operations',
    detail:
      'For approved technicians, team leads, managers and administrators.',
  },
};

const workspaces = [
  {
    href: '/client',
    title: 'Client portal',
    detail: 'Request support, follow your tickets and read published guidance.',
    roles: ['USER', 'ADMIN', 'MANAGER'],
  },
  {
    href: '/operations',
    title: 'Technician workspace',
    detail: 'Create tickets and work your assigned queue.',
    roles: ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'],
  },
  {
    href: '/management',
    title: 'Management workspace',
    detail: 'Monitor all tickets, workload, SLA and approvals.',
    roles: ['TEAM_LEAD', 'MANAGER', 'ADMIN'],
  },
  {
    href: '/admin',
    title: 'Administration',
    detail: 'Configure access, clients, SLA and service-desk data.',
    roles: ['ADMIN', 'MANAGER'],
  },
] as const;

function availableWorkspaces(roles: string[]) {
  return workspaces.filter((workspace) =>
    workspace.roles.some((role) => roles.includes(role)),
  );
}

function canOpenPortal(portal: Portal, roles: string[]) {
  if (portal === 'home') return true;
  if (portal === 'client') return hasFullAccess(roles) || roles.includes('USER');
  return roles.some((role) =>
    ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(role),
  );
}

export default function ServiceDesk({ portal = 'home' }: { portal?: Portal }) {
  const router = useRouter();
  const [signInError, setSignInError] = useState('');
  const [microsoftConfigured, setMicrosoftConfigured] = useState(false);
  const [passwordTestLogin, setPasswordTestLogin] = useState(false);
  const [localTestLogin, setLocalTestLogin] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const reasons: Record<string, string> = {
      access:
        'Your account has not been granted access. Contact your administrator.',
      unavailable: 'Sign-in is temporarily unavailable. Please try again.',
      expired:
        'This sign-in attempt expired or was cancelled. Please sign in again.',
    };
    const reason = reasons[query.get('signin') ?? ''];
    const reference = query.get('reference') ?? '';
    if (reason)
      window.history.replaceState(
        null,
        '',
        portal === 'home' ? '/' : `/${portal}`,
      );
    let active = true;
    async function load() {
      try {
        const status = await fetch('/api/auth/status', { cache: 'no-store' });
        if (active && reason)
          setSignInError(
            reason +
              (/^[a-f0-9-]{36}$/.test(reference)
                ? ` Reference: ${reference}`
                : ''),
          );

        if (!status.ok) throw new Error('status');
        const configuration = (await status.json()) as { configured: boolean; localTestLogin?: boolean; microsoftConfigured?: boolean; passwordTestLogin?: boolean };
        if (active) {
          setMicrosoftConfigured(configuration.microsoftConfigured === true);
          setPasswordTestLogin(configuration.passwordTestLogin === true);
          setLocalTestLogin(configuration.localTestLogin === true);
        }
        const session = await fetch('/api/auth/me', { cache: 'no-store' });
        if (session.status === 401) {
          if (active) setState({ kind: 'signed-out' });
          return;
        }
        if (!session.ok) throw new Error('session');
        const view = (await session.json()) as {
          user: UserView;
          csrfToken: string;
        };
        if (active) {
          setState({
            kind: 'signed-in',
            user: view.user,
            csrfToken: view.csrfToken,
          });
        }
      } catch {
        if (active) setState({ kind: 'error' });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [portal]);

  useEffect(() => {
    if (state.kind !== 'signed-in') return;
    if (!canOpenPortal(portal, state.user.roles)) {
      router.replace('/');
      return;
    }
    const choices = availableWorkspaces(state.user.roles);
    if (portal === 'home' && choices.length === 1)
      router.replace(choices[0]!.href);
  }, [portal, router, state]);

  async function logout(csrfToken: string) {
    setSignInError('');
    try {
      await signOutSession(csrfToken);
      setState({ kind: 'signed-out' });
      router.replace('/');
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : 'Sign out could not be completed. Please try again.');
    }
  }

  async function enterLocalPreview() {
    setSigningIn(true);
    setSignInError('');
    try {
      const response = await fetch('/api/auth/local-test', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to enter the local test workspace.');
      window.location.assign('/');
    } catch {
      setSignInError('Unable to enter the local test workspace. Please retry.');
      setSigningIn(false);
    }
  }

  async function passwordLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordTestLogin || signingIn) return;
    setSigningIn(true);
    setSignInError('');
    try {
      const response = await fetch('/api/auth/test-password', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password, mode: 'employee' }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error?.message ?? 'Unable to sign in. Please retry.');
      }
      setPassword('');
      window.location.assign('/');
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : 'Unable to sign in.');
      setPassword('');
      setSigningIn(false);
    }
  }

  if (state.kind === 'signed-out')
    return (
      <div className="astra-login">
        <section className="astra-login-hero" aria-label="Welcome to ASTRA">
          <div className="astra-login-intro">
            <div className="astra-login-logo">
              <BrandLogo />
            </div>
            <h2>
              Welcome to <br />
              ASTRA
            </h2>
            <p>
              Your IT support, connected.
              <br />A clear workspace for every service journey.
            </p>
          </div>
          <small>ASTRA · Ticketing System</small>
        </section>
        <main className="astra-login-main">
          <div className="astra-login-card">
            <BrandLogo className="astra-login-small-logo" />
            <div className="eyebrow">ASTRA</div>
            <h1>IT Support Desk</h1>
            <p>Sign in to your workspace.</p>
            {signInError ? (
              <div className="notice error" role="alert">
                {signInError}
              </div>
            ) : null}
            <form className="astra-password-login" onSubmit={(event) => void passwordLogin(event)}>
              <label>
                Work email
                <input required type="email" autoComplete="username" value={login}
                  maxLength={254} disabled={signingIn || !passwordTestLogin}
                  onChange={(event) => setLogin(event.target.value)} />
              </label>
              <label>
                Password
                <input required type="password" autoComplete="current-password" value={password}
                  maxLength={200} disabled={signingIn || !passwordTestLogin}
                  onChange={(event) => setPassword(event.target.value)} />
              </label>
              <button type="submit" className="microsoft-button astra-sign-in" disabled={signingIn || !passwordTestLogin}>
                {signingIn ? 'Signing in…' : 'Sign in'}
              </button>
              <details>
                <summary>Forgot password?</summary>
                <p>Contact your ASTRA administrator for help resetting your password.</p>
              </details>
            </form>
            {microsoftConfigured && (
              <Link prefetch={false} className="secondary astra-admin-login" href="/api/auth/login?returnTo=%2F">
                Continue with Microsoft
              </Link>
            )}
            {localTestLogin && (
              <button type="button" className="secondary astra-admin-login" disabled={signingIn}
                onClick={() => void enterLocalPreview()}>
                Enter local test workspace
              </button>
            )}
            {!passwordTestLogin && (
              <p role="status">Email and password sign-in is unavailable in this environment.</p>
            )}
            <div className="astra-login-divider">
              <span>SECURE WORKSPACE ACCESS</span>
            </div>
            <p>
              <Link className="support-inline-link" href="/support">
                Need help? Submit a client support request →
              </Link>
            </p>
            <small>
              Your approved access determines the workspaces you can open.
            </small>
          </div>
          <small className="astra-login-footer">
            Support starts with a secure connection.
          </small>
        </main>
      </div>
    );
  return (
    <div className="min-h-screen astra-workspace-picker">
      <header className="border-b border-slate-200 bg-white px-6 py-5 md:px-12">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="astra-picker-brand">
            <BrandMark />
            <span>
              ASTRA<small>Ticketing System</small>
            </span>
          </div>
          {state.kind === 'signed-in' ? (
            <button
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              onClick={() => void logout(state.csrfToken)}
              type="button"
            >
              Sign out
            </button>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        {state.kind === 'signed-in' && signInError ? (
          <div role="alert" className="notice error">{signInError}</div>
        ) : null}
        {state.kind === 'loading' ? (
          <StatusCard
            title="Checking access…"
            detail="Confirming service configuration."
          />
        ) : null}
        {state.kind === 'unconfigured' ? (
          <>
            <Eyebrow />
            <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
              Identity setup is required.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Sign-in is not available yet. Please contact your system
              administrator.
            </p>
            <StatusCard
              title="Microsoft Entra not configured"
              detail="Your organisation manages access to this workspace."
            />
          </>
        ) : null}
        {state.kind === 'signed-in' && portal === 'home' ? (
          <>
            <section className="astra-picker-welcome">
              <div className="astra-picker-welcome-copy">
                <Eyebrow text="YOUR ASTRA WORKSPACE" />
                <h1>Choose your workspace</h1>
                <p>
                  Hello, {state.user.displayName}. Select how you want to work
                  in the Service Desk today.
                </p>
                <div className="astra-picker-roles">
                  {state.user.roles.map((role) => (
                    <span key={role}>{uiLabel(role)}</span>
                  ))}
                </div>
              </div>
              <div className="astra-picker-welcome-art" aria-hidden="true">
                <BrandMark />
              </div>
            </section>
            <section className="astra-picker-grid">
              {availableWorkspaces(state.user.roles).map((workspace) => (
                <Link
                  className={`astra-picker-card astra-picker-card-${workspace.href.slice(1)}`}
                  href={workspace.href}
                  key={workspace.href}
                >
                  <div className="astra-picker-card-top">
                    <span className="astra-picker-card-icon" aria-hidden="true">
                      <UiIcon
                        name={
                          workspace.href === '/admin'
                            ? 'users'
                            : workspace.href === '/management'
                              ? 'reports'
                              : 'tickets'
                        }
                      />
                    </span>
                    <span
                      className="astra-picker-card-arrow"
                      aria-hidden="true"
                    >
                      ↗
                    </span>
                  </div>
                  <h2>{workspace.title}</h2>
                  <p className="astra-picker-card-detail">{workspace.detail}</p>
                  <span className="astra-picker-card-action">
                    Open workspace →
                  </span>
                </Link>
              ))}
            </section>
          </>
        ) : null}
        {state.kind === 'signed-in' &&
        portal !== 'home' &&
        canOpenPortal(portal, state.user.roles) ? (
          <>
            <Eyebrow text={portalCopy[portal].eyebrow} />
            <h1 className="mt-5 text-4xl font-bold tracking-tight">
              {portal === 'client'
                ? 'Client support portal'
                : 'Service operations portal'}
            </h1>
            <p className="mt-3 text-slate-600">
              Hello, {state.user.displayName}. {state.user.email}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {state.user.roles.map((role) => (
                <span
                  className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800"
                  key={role}
                >
                  {uiLabel(role)}
                </span>
              ))}
            </div>
            <section className="mt-12 grid gap-5 md:grid-cols-3">
              {portal === 'client' ? (
                <>
                  <ModuleCard
                    title="My support"
                    detail="Your requests and updates will appear here as ticketing is introduced."
                  />
                  <ModuleCard
                    title="My organisation"
                    detail="Your approved client access and service information."
                  />
                  <ModuleCard
                    title="Help resources"
                    detail="Knowledge and service options will appear here."
                  />
                </>
              ) : (
                <>
                  <ModuleCard
                    title="Service desk"
                    detail="Technician work queues will appear here with Phase 2 ticketing."
                  />
                  <ModuleCard
                    title="Client context"
                    detail="Approved clients, contacts, sites and assets are managed by administrators."
                  />
                  <ModuleCard
                    title="Operations"
                    detail="SLA, approvals and notifications will be added in later phases."
                  />
                </>
              )}
            </section>
            {hasFullAccess(state.user.roles) ? (
              <Link
                className="mt-8 inline-flex rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
                href="/admin"
              >
                Open administration
              </Link>
            ) : null}
          </>
        ) : null}
        {state.kind === 'error' ? (
          <StatusCard
            title="Service temporarily unavailable"
            detail="Please retry. If the problem continues, contact the system administrator."
          />
        ) : null}
      </main>
    </div>
  );
}

function Eyebrow({ text = 'INTERNAL MSP OPERATIONS' }: { text?: string }) {
  return (
    <p className="text-xs font-bold tracking-[0.2em] text-blue-700">{text}</p>
  );
}

function StatusCard({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="mt-12 rounded-2xl border border-slate-200 bg-white p-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-3 leading-7 text-slate-600">{detail}</p>
    </section>
  );
}

function ModuleCard({ title, detail }: { title: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </article>
  );
}
