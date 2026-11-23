import { hasFullAccessRole } from '../role-access';

export const INTERNAL_MSP_ID = '00000000-0000-4000-8000-000000000132';
export function workScopeForRole(role: string, scope: string): string {
  if (hasFullAccessRole(role)) return 'ALL';
  if (role === 'INTERN') return scope === 'BOTH' ? 'BOTH' : 'INTERNAL';
  if (role === 'USER') return scope === 'INTERNAL' ? 'INTERNAL' : 'CLIENT';
  return scope === 'ALL' ? 'BOTH' : scope;
}
export function effectiveChangeAccess(role: string, configured: string): string {
  if (hasFullAccessRole(role) || role === 'TEAM_LEAD') return 'CHANGE_MANAGER';
  if (role === 'USER') return 'NONE';
  return role === 'TECHNICIAN' && configured === 'NONE' ? 'CONTRIBUTOR' : configured;
}
export function defaultChangeAccess(role: string): string {
  return effectiveChangeAccess(role, 'NONE');
}

// "All" adds every active record, across every page, not just visible search results.
// It remains an explicit selection of current IDs, not unrestricted future access.
export async function allActiveAccessIds(
  resource: 'clients' | 'departments',
  request: (path: string) => Promise<unknown>,
): Promise<string[]> {
  const ids = new Set<string>();
  const seen = new Set<string>();
  let expectedTotal: number | undefined;
  const size = 100;
  for (let page = 1; page <= 1000; page++) {
    const result = await request(`/admin/${resource}?status=active&pageSize=${size}&page=${page}`) as {
      items?: { id?: unknown }[]; total?: unknown;
    };
    if (!Array.isArray(result.items) || typeof result.total !== 'number' ||
        !Number.isSafeInteger(result.total) || result.total < 0 || result.items.length > size)
      throw new Error('Could not verify the complete selection. Please try again.');
    if (expectedTotal !== undefined && expectedTotal !== result.total)
      throw new Error('The options changed while loading. Nothing was selected; please try again.');
    expectedTotal = result.total;
    for (const row of result.items) {
      if (typeof row.id !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(row.id))
        throw new Error('An option has an invalid identifier. Nothing was selected.');
      if (seen.has(row.id)) throw new Error('The options changed while loading. Nothing was selected; please try again.');
      seen.add(row.id);
      if (resource !== 'clients' || row.id !== INTERNAL_MSP_ID) ids.add(row.id);
    }
    if (page * size >= result.total) {
      if (seen.size !== result.total) throw new Error('Could not load the complete selection. Nothing was selected.');
      return [...ids];
    }
    if (!result.items.length) break;
  }
  throw new Error('Could not load every option. Nothing was selected; please try again.');
}
