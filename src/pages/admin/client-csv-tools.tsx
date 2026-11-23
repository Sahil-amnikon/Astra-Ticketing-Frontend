import { useRef, useState } from 'react';
import type { Row } from './record-form';
import { clientCsvHeaders, encodeClientCsv, parseClientCsv } from './client-csv';
import './client-csv-tools.css';

type Api = (path: string, init?: RequestInit) => Promise<unknown>;
type CsvRow = { line: number; msp: string; clientId: string; name: string; prefix: string; address: string; state: string; error: string };
async function allRecords(request: Api, resource: string, filters = ''): Promise<Row[]> {
  const result: Row[] = [];
  for (let page = 1; page <= 1000; page++) {
    const data = await request(`/admin/${resource}?page=${page}&pageSize=100${filters}`) as { items: Row[]; total: number };
    result.push(...data.items);
    if (result.length >= data.total) return result;
    if (!data.items.length) throw new Error('The client list changed while loading. Please retry.');
  }
  throw new Error('Too many records to export at once. Select an MSP first.');
}
function download(name: string, rows: string[][]) {
  const url = URL.createObjectURL(new Blob([encodeClientCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const key = (id: string, name: string) => id + ':' + name.trim().toLocaleLowerCase();

export default function ClientCsvTools({ request, search, status, msp, onSaved }: {
  request: Api; search: string; status: string; msp: string; onSaved: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const gate = useRef(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function run(work: () => Promise<void>) {
    if (gate.current) return;
    gate.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (e) { setError((e as Error).message); }
    finally { gate.current = false; setBusy(false); }
  }
  async function readFile(file?: File) {
    if (!file) return;
    setRows([]);
    await run(async () => {
      if (!file.name.toLowerCase().endsWith('.csv') || file.size > 1024 * 1024)
        throw new Error('Choose a CSV file smaller than 1 MB.');
      const parsed = parseClientCsv(await file.text());
      const headers = parsed.shift()!.map(h => h.trim().toLowerCase());
      if (!headers.includes('msp') || !headers.includes('name') || new Set(headers).size !== headers.length)
        throw new Error('The CSV needs unique column headings including MSP and Name. Download the template below.');
      if (!parsed.length || parsed.length > 500) throw new Error('Upload between 1 and 500 clients at a time.');
      const [msps, existing] = await Promise.all([allRecords(request, 'clients', '&status=active'), allRecords(request, 'sites')]);
      const seen = new Set(existing.map(r => key(String(r.client_id), String(r.name))));
      const prefixes = new Set([...existing, ...msps].map(r => String(r.ticket_prefix ?? '').toUpperCase()).filter(Boolean));
      const get = (cells: string[], name: string) => {
        const value = (cells[headers.indexOf(name)] ?? '').trim();
        return /^'[\s]*[=+\-@]/.test(value) ? value.slice(1) : value;
      };
      const preview = parsed.map((cells, i): CsvRow => {
        const team = get(cells, 'msp'), name = get(cells, 'name'), prefix = get(cells, 'ticketprefix').toUpperCase(), address = get(cells, 'address');
        const matches = msps.filter(m => String(m.name).trim().toLowerCase() === team.toLowerCase());
        const clientId = matches.length === 1 ? String(matches[0].id) : '';
        let problem = cells.length !== headers.length ? 'Column count does not match the headings.' :
          !clientId ? 'MSP was not found or is ambiguous.' : !name || name.length > 200 ? 'Name must contain 1–200 characters.' :
          address.length > 2000 ? 'Address exceeds 2,000 characters.' : prefix && !/^[A-Z][A-Z0-9]{1,15}$/.test(prefix) ? 'Prefix must start with a letter and contain 2–16 letters/numbers.' : '';
        const duplicate = !!clientId && seen.has(key(clientId, name));
        if (!problem && !duplicate && prefix && prefixes.has(prefix)) problem = 'Ticket prefix is already used.';
        if (!problem) { seen.add(key(clientId, name)); if (prefix) prefixes.add(prefix); }
        return { line: i + 2, msp: team, clientId, name, prefix, address, state: duplicate && !problem ? 'Skipped — already exists' : 'Ready', error: problem };
      });
      setRows(preview);
      setMessage('Review the rows below. Existing clients will be skipped. Nothing has been added yet.');
    });
    if (input.current) input.current.value = '';
  }
  async function save() {
    await run(async () => {
      if (rows.some(r => r.error)) throw new Error('Correct the highlighted rows in your CSV and upload it again.');
      const existing = await allRecords(request, 'sites');
      const seen = new Set(existing.map(r => key(String(r.client_id), String(r.name))));
      const next = rows.map(r => ({ ...r }));
      let added = 0;
      try {
        for (const row of next) {
          if (row.state !== 'Ready') continue;
          if (seen.has(key(row.clientId, row.name))) { row.state = 'Skipped — already exists'; continue; }
          try {
            await request('/sites', { method: 'POST', body: JSON.stringify({ clientId: row.clientId, name: row.name, ticketPrefix: row.prefix || null, address: row.address || null }) });
          } catch (e) { row.error = (e as Error).message; throw new Error(`Import stopped at row ${row.line}: ${row.error}. ${added} clients were added. Correct the CSV and upload again; existing clients will be skipped.`); }
          row.state = 'Added'; added++; seen.add(key(row.clientId, row.name));
        }
        setMessage(`${added} clients added. ${next.filter(r => r.state.startsWith('Skipped')).length} existing clients skipped.`);
      } finally { setRows(next); if (added) onSaved(); }
    });
  }
  const ready = rows.filter(r => r.state === 'Ready' && !r.error).length;
  return <section className="panel client-csv-tools" aria-label="Client CSV import and export">
    <div className="client-csv-toolbar"><div><h3>Client CSV</h3><p>Download clients or add from a CSV file.</p></div><div className="client-csv-buttons">
      <button className="secondary" disabled={busy} onClick={() => input.current?.click()}>Import CSV</button>
      <button className="secondary" disabled={busy} onClick={() => download('astra-client-import-template.csv', [clientCsvHeaders])}>Download template</button>
      <button className="primary" disabled={busy} onClick={() => void run(async () => {
        const filters = `&q=${encodeURIComponent(search)}&status=${status}${msp ? `&clientId=${msp}` : ''}`;
        const data = await allRecords(request, 'sites', filters);
        download('astra-clients.csv', [clientCsvHeaders, ...data.map(r => [String(r.client_name ?? ''), String(r.name ?? ''), String(r.ticket_prefix ?? ''), String(r.address ?? '')])]);
        setMessage(`${data.length} clients exported.`);
      })}>Export CSV</button>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={e => void readFile(e.target.files?.[0])} />
    </div></div>
    {busy && <p role="status">Processing… Please keep this page open.</p>}
    {message && <p className="client-csv-feedback" role="status">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
    {!!rows.length && <div className="client-csv-preview"><p className="hint">MSP and Name are required. Prefix and address are optional.</p><p>{ready} ready · {rows.filter(r => r.error).length} errors · {rows.filter(r => r.state.startsWith('Skipped')).length} skipped</p>
      <div className="client-csv-table"><table><thead><tr><th>Row</th><th>MSP</th><th>Client</th><th>Result</th></tr></thead><tbody>{rows.map(r => <tr key={r.line}><td>{r.line}</td><td>{r.msp}</td><td>{r.name}</td><td>{r.error || r.state}</td></tr>)}</tbody></table></div>
      <div className="client-csv-buttons"><button className="primary" disabled={busy || !ready || rows.some(r => r.error)} onClick={() => void save()}>Add {ready} clients</button><button disabled={busy} onClick={() => { setRows([]); setMessage(''); setError(''); }}>Close preview</button></div>
    </div>}
  </section>;
}
