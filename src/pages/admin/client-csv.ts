export const clientCsvHeaders = ['MSP', 'Name', 'TicketPrefix', 'Address'];

export function parseClientCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const pushField = () => { row.push(field); field = ''; closed = false; };
  const pushRow = () => { pushField(); if (row.some(v => v.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"') {
      if (field || closed) throw new Error('Unexpected quote in CSV. Use the downloaded template.');
      quoted = true;
    } else if (c === ',') pushField();
    else if (c === '\r' || c === '\n') { pushRow(); if (c === '\r' && text[i + 1] === '\n') i++; }
    else { if (closed) throw new Error('Unexpected text after a quoted CSV value.'); field += c; }
  }
  if (quoted) throw new Error('The CSV has an unclosed quote.');
  if (field || row.length || closed) pushRow();
  if (!rows.length) throw new Error('The CSV is empty.');
  return rows;
}

export function encodeClientCsv(rows: string[][]): string {
  return '\uFEFF' + rows.map(row => row.map(value => {
    // Protect spreadsheet users from formula execution in exported names/addresses.
    const safe = /^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replace(/"/g, '""') + '"';
  }).join(',')).join('\r\n') + '\r\n';
}
