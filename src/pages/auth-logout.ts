// A 401 means the local session is already gone. Other failures must not pretend
// that logout succeeded or replace the entire workspace with an outage screen.
export async function signOutSession(
  csrfToken: string,
  request: typeof fetch = fetch,
): Promise<void> {
  const send = (token: string) => request('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'x-csrf-token': token },
  });
  let response = await send(csrfToken);
  if (response.ok || response.status === 401) return;

  if (response.status === 403) {
    const session = await request('/api/auth/me', {
      credentials: 'same-origin', cache: 'no-store',
    });
    if (session.status === 401) return;
    if (session.ok) {
      const current = await session.json() as { csrfToken?: unknown };
      if (typeof current.csrfToken === 'string' && current.csrfToken &&
          current.csrfToken !== csrfToken) {
        response = await send(current.csrfToken);
        if (response.ok || response.status === 401) return;
      }
    }
  }
  throw new Error(response.status === 403
    ? 'Sign out was blocked by a session security check. You are still signed in. Refresh this page and try again.'
    : 'Sign out could not be completed. You may still be signed in. Please try again.');
}
