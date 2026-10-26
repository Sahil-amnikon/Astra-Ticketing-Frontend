export function exportCsv(
  filename: string,
  rows: Record<string, string | number>[],
) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const cell = (value: unknown) =>
    '"' +
    String(value ?? '')
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const csv = [
    keys.map(cell).join(','),
    ...rows.map((row) => keys.map((key) => cell(row[key])).join(',')),
  ].join('\r\n');
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
