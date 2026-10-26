import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const hint = request.nextUrl.searchParams.get('workspace');
  const workspace =
    hint && ['operations', 'management', 'admin', 'client'].includes(hint)
      ? hint
      : /^\/(admin|management|operations|client)(?:\/|$)/.exec(
          request.nextUrl.pathname,
        )?.[1];
  if (
    workspace &&
    !request.headers.has('next-router-prefetch') &&
    request.headers.get('purpose') !== 'prefetch'
  )
    response.cookies.set('amnikon_workspace', workspace, {
      httpOnly: true,
      sameSite: 'lax',
      secure:
        request.nextUrl.protocol === 'https:' ||
        request.headers.get('x-forwarded-proto') === 'https',
      path: '/',
    });
  return response;
}
export const config = {
  matcher: [
    '/admin/:path*',
    '/management/:path*',
    '/operations/:path*',
    '/client/:path*',
  ],
};
