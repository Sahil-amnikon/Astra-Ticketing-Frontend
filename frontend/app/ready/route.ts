export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const base = process.env.API_INTERNAL_URL;
    if (!base) throw new Error('Missing upstream');
    const response = await fetch(new URL('/ready', base), {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error('Upstream unavailable');
    return Response.json({ status: 'ready' });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
