import type { NextRequest } from 'next/server';

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (
    !path.length ||
    path.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment))
  ) {
    return Response.json(
      { error: { code: 'INVALID_PATH', message: 'Not found' } },
      { status: 404 },
    );
  }
  const internalBase = process.env.API_INTERNAL_URL;
  if (!internalBase) {
    return Response.json(
      { error: { code: 'PROXY_UNAVAILABLE', message: 'Service unavailable' } },
      { status: 503 },
    );
  }
  const target = new URL(path.join('/'), `${internalBase.replace(/\/$/, '')}/`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const name of [
    'accept',
    'content-type',
    'cookie',
    'origin',
    'x-csrf-token',
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Never forward a caller-supplied role or workspace header. Context identifies
  // the selected UI workspace; the API validates it against the stored account.
  let refererPath = '';
  let workspaceHint: string | null = null;
  try {
    const referer = new URL(request.headers.get('referer') ?? '');
    if (referer.host === request.headers.get('host')) {
      refererPath = referer.pathname;
      workspaceHint = referer.searchParams.get('workspace');
    }
  } catch {
    /* Requests without a browser referrer use the workspace cookie. */
  }
  const routeWorkspace =
    /^(?:\/)(admin|management|operations|client)(?:\/|$)/.exec(
      refererPath,
    )?.[1];
  const workspace =
    workspaceHint ??
    routeWorkspace ??
    request.cookies.get('amnikon_workspace')?.value;
  if (path.join('/') === 'auth/me' && refererPath === '/')
    headers.set('x-amnikon-workspace', 'chooser');
  else if (workspace) headers.set('x-amnikon-workspace', workspace);
  headers.set('x-forwarded-host', request.nextUrl.host);
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    const responseHeaders = new Headers();
    for (const name of ['content-type', 'location', 'set-cookie']) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set('cache-control', 'no-store');
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: { code: 'PROXY_UNAVAILABLE', message: 'Service unavailable' } },
      { status: 503 },
    );
  }
}

export const dynamic = 'force-dynamic';
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
