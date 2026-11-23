import type { Request, Row } from './record-form';

// Older servers search names only. Resolve selected IDs from the same permitted
// list in that case; share a short-lived lookup when several memberships load.
const lists = new WeakMap<Request, Map<string, { at: number; result: Promise<Map<string, Row>> }>>();
async function permittedRecords(request: Request, resource: string) {
  let resources = lists.get(request);
  if (!resources) { resources = new Map(); lists.set(request, resources); }
  const cached = resources.get(resource);
  if (cached && Date.now() - cached.at < 10000) return cached.result;
  const result = (async () => {
    const records = new Map<string, Row>();
    for (let page = 1; page <= 1000; page++) {
      const data = await request(`/admin/${resource}?pageSize=100&page=${page}`) as { items: Row[]; total: number };
      if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0)
        throw new Error('Invalid directory response');
      for (const row of data.items) records.set(String(row.id), row);
      if (page * 100 >= data.total) return records;
      if (!data.items.length) throw new Error('Incomplete directory response');
    }
    throw new Error('Directory is too large');
  })();
  const entry = { at: Date.now(), result };
  resources.set(resource, entry);
  void result.catch(() => { if (resources.get(resource) === entry) resources.delete(resource); });
  return result;
}

export async function findAccessRecord(request: Request, resource: string, id: string): Promise<Row | undefined> {
  const data = await request(`/admin/${resource}?q=${encodeURIComponent(id)}&pageSize=1`) as { items: Row[] };
  const exact = data.items?.find(row => String(row.id) === id);
  return exact ?? (await permittedRecords(request, resource)).get(id);
}
