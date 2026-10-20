import {
  breakdown,
  reportOwners,
  type ReportKind,
  type ReportRow,
  type ReportFilters,
} from './module-report-data';
import {
  overviewModules,
  overviewNumbers,
  overviewLifecycle,
  overviewRecords,
  type OverviewReport,
} from './overview-report-data';

export type ExcelReport = {
  kind: ReportKind;
  title: string;
  identifier: string;
  titleKey: string;
  owner: string;
  extra: string;
  extraLabel: string;
  rows: ReportRow[];
  filters: ReportFilters;
  generatedAt: string;
  clientName: string;
  ownerNames: string[];
};
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const pkg = 'http://schemas.openxmlformats.org/package/2006/relationships';
const xml = (value: unknown) =>
  String(value ?? '')
    // XML 1.0 excludes these control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
const part = (body: string) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + body;
const human = (value: unknown) =>
  String(value ?? 'Not specified').replaceAll('_', ' ');
const colors = ['2563EB', '7C3AED', '0D9488', 'EA580C', 'DB2777', '0891B2'];
function column(index: number): string {
  let value = index + 1,
    name = '';
  while (value) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}
function cell(
  address: string,
  value: unknown,
  style = 0,
  formula?: string,
): string {
  if (formula)
    return `<c r="${address}" s="${style}"><f>${xml(formula)}</f><v>${xml(value)}</v></c>`;
  if (typeof value === 'number' && Number.isFinite(value))
    return `<c r="${address}" s="${style}"><v>${value}</v></c>`;
  const text = String(value ?? '');
  if (text.length > 32767)
    throw new Error(
      'A record exceeds Excel’s cell text limit. Use the CSV export for this selection.',
    );
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
}
const excelDate = (value: unknown) => {
  if (value == null || value === '') return '';
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? time / 86400000 + 25569 : String(value);
};

// A standards-based ZIP container, using STORE so generation needs no server or runtime dependency.
// CRC32 and UTF-8 entries are required by the XLSX/Open Packaging Convention container.
function zip(files: [string, string][]): Uint8Array {
  const encoder = new TextEncoder();
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let n = i;
    for (let b = 0; b < 8; b++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    table[i] = n;
  }
  const chunks: Uint8Array[] = [],
    directory: Uint8Array[] = [];
  let offset = 0;
  for (const [path, text] of files) {
    const name = encoder.encode(path),
      data = encoder.encode(text);
    let crc = 0xffffffff;
    for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + name.length),
      v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint16(12, 33, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    chunks.push(local, data);
    const central = new Uint8Array(46 + name.length),
      c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    directory.push(central);
    offset += local.length + data.length;
  }
  const size = directory.reduce((total, entry) => total + entry.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + size + end.length);
  let cursor = 0;
  for (const chunk of [...chunks, ...directory, end]) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }
  return result;
}

const styles = part(`<styleSheet xmlns="${ns}">
<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm&quot; UTC&quot;"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>
<fonts count="5"><font><sz val="10"/><color rgb="FF172554"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF172554"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF2563EB"/><name val="Arial"/></font><font><i/><sz val="10"/><color rgb="FF64748B"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF172554"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="3" fontId="3" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="center"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="center" horizontal="right"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="center" horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);

function barChart(
  title: string,
  labels: string[],
  counts: number[],
  labelColumn: string,
  countColumn: string,
  color: string,
  axis: number,
  sheet = 'Summary',
  startRow = 35,
): string {
  const cache = (values: (string | number)[], numeric: boolean) =>
    `<c:${numeric ? 'numCache' : 'strCache'}>${numeric ? '<c:formatCode>#,##0</c:formatCode>' : ''}<c:ptCount val="${values.length}"/>${values.map((value, i) => `<c:pt idx="${i}"><c:v>${xml(value)}</c:v></c:pt>`).join('')}</c:${numeric ? 'numCache' : 'strCache'}>`;
  const font =
    '<a:defRPr sz="1000"><a:solidFill><a:srgbClr val="172554"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr>';
  return part(
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${rel}"><c:lang val="en-US"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr>${font}</a:pPr><a:r><a:t>${xml(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Records</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:cat><c:strRef><c:f>'${sheet}'!$${labelColumn}$${startRow}:$${labelColumn}$${startRow - 1 + labels.length}</c:f>${cache(labels, false)}</c:strRef></c:cat><c:val><c:numRef><c:f>'${sheet}'!$${countColumn}$${startRow}:$${countColumn}$${startRow - 1 + counts.length}</c:f>${cache(counts, true)}</c:numRef></c:val></c:ser><c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/></c:dLbls><c:gapWidth val="70"/><c:axId val="${axis}"/><c:axId val="${axis + 1}"/></c:barChart><c:catAx><c:axId val="${axis}"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:axPos val="l"/><c:tickLblPos val="nextTo"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>${font}</a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr><c:crossAx val="${axis + 1}"/><c:crosses val="max"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="${axis + 1}"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:axPos val="b"/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="${axis}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>${font}</a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr></c:chartSpace>`,
  );
}

export function createReportExcel(report: ExcelReport): Uint8Array {
  const { rows, kind } = report;
  if (rows.length > 5000)
    throw new Error(
      'Excel reports support up to 5,000 records. Narrow the report filters.',
    );
  const columns = [
    ...new Set([
      report.identifier,
      report.titleKey,
      'client_name',
      'status',
      report.owner,
      kind === 'tickets' ? 'assigned_user_id' : 'owner_user_id',
      'priority',
      report.extra,
      'created_at',
      'updated_at',
    ]),
  ];
  const last = Math.max(5, rows.length + 4),
    statusCol = column(columns.indexOf('status')),
    ownerCol = column(5);
  const statusRange = `'Records'!$${statusCol}$5:$${statusCol}$${last}`;
  const ownerRange = `'Records'!$${ownerCol}$5:$${ownerCol}$${last}`;
  const summaryRows = new Map<number, string[]>(),
    merges: string[] = [];
  const add = (
    r: number,
    c: number,
    value: unknown,
    style = 0,
    formula?: string,
  ) => {
    const cells = summaryRows.get(r) ?? [];
    cells.push(cell(`${column(c)}${r}`, value, style, formula));
    summaryRows.set(r, cells);
  };
  const span = (
    r: number,
    start: number,
    end: number,
    value: unknown,
    style = 0,
    formula?: string,
  ) => {
    add(r, start, value, style, formula);
    merges.push(`${column(start)}${r}:${column(end)}${r}`);
  };
  span(2, 0, 13, `ASTRA ${report.title}`, 1);
  span(
    4,
    0,
    13,
    `Created period: ${report.filters.from} through ${report.filters.to} (UTC)`,
  );
  span(
    5,
    0,
    13,
    `Client: ${report.clientName}    Status: ${human(report.filters.status || 'All statuses')}`,
  );
  span(
    6,
    0,
    13,
    `Owners: ${report.ownerNames.join('; ') || 'All owners'}    Search: ${report.filters.q || 'None'}`,
    8,
  );
  span(
    7,
    0,
    13,
    `Generated: ${report.generatedAt}    Status, owner, SLA and risk are current values.`,
    4,
  );
  const terminal = [
    'RESOLVED',
    'CLOSED',
    'COMPLETED',
    'CANCELLED',
    'REJECTED',
    'ROLLED_BACK',
    'FAILED',
  ];
  const closed = rows.filter((row) =>
    terminal.includes(String(row.status)),
  ).length;
  const closedFormula = terminal
    .map((value) => `COUNTIFS(${statusRange},"${value}")`)
    .join('+');
  const extraRange = `'Records'!$${column(columns.indexOf(report.extra))}$5:$${column(columns.indexOf(report.extra))}$${last}`;
  const attentionValues =
    kind === 'tickets'
      ? ['AT_RISK', 'BREACHED']
      : kind === 'changes'
        ? ['HIGH', 'CRITICAL']
        : ['KNOWN_ERROR'];
  const attentionRange = kind === 'problems' ? statusRange : extraRange;
  const attention = rows.filter((row) =>
    attentionValues.includes(
      String(row[kind === 'problems' ? 'status' : report.extra]),
    ),
  ).length;
  const totalFormula = `COUNTA('Records'!$A$5:$A$${last})`;
  const metrics: [string, number, string][] = [
    ['Matching records', rows.length, totalFormula],
    ['Active records', rows.length - closed, `A10-H10`],
    ['Terminal records', closed, closedFormula],
    [
      kind === 'tickets'
        ? 'SLA at risk / breached'
        : kind === 'changes'
          ? 'High / critical risk'
          : 'Known errors',
      attention,
      attentionValues
        .map((value) => `COUNTIFS(${attentionRange},"${value}")`)
        .join('+'),
    ],
  ];
  metrics.forEach(([name, count, formula], i) => {
    const start = [0, 4, 7, 11][i],
      end = [2, 6, 9, 13][i];
    span(9, start, end, name);
    span(10, start, end, count, 3, formula);
  });
  span(
    12,
    0,
    13,
    'Terminal: resolved, closed, completed, cancelled, rejected, rolled back or failed.',
    4,
  );
  const statuses = breakdown(rows, 'status');
  const owners = reportOwners(rows, kind).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  const visibleOwners = owners.slice(0, 12);
  const ownerLabels = visibleOwners.map((owner) =>
    owners.filter((other) => other.name === owner.name).length > 1
      ? `${owner.name} [${owners.findIndex((other) => other.id === owner.id) + 1}]`
      : owner.name,
  );
  const ownerCounts = visibleOwners.map((owner) => owner.count);
  if (owners.length > 12) {
    ownerLabels.push('Other owners');
    ownerCounts.push(
      owners.slice(12).reduce((sum, owner) => sum + owner.count, 0),
    );
  }
  if (!rows.length)
    span(20, 0, 13, 'No records match this report selection.', 1);
  span(
    33,
    0,
    13,
    owners.length > 12
      ? 'Owner chart shows the 12 largest workloads and combines remaining owners. All records are on Records.'
      : 'Chart counts reconcile to Records. Filters describe the snapshot at export time.',
    4,
  );
  span(34, 0, 2, 'Status', 2);
  add(34, 3, 'Records', 2);
  add(34, 4, 'Share', 2);
  span(34, 5, 6, 'Status code', 2);
  span(34, 7, 10, 'Owner', 2);
  add(34, 11, 'Records', 2);
  add(34, 12, 'Share', 2);
  add(34, 14, 'Owner ID', 2);
  statuses.forEach(([name, count], i) => {
    const r = 35 + i;
    span(r, 0, 2, human(name), 8);
    add(r, 3, count, 6, `COUNTIFS(${statusRange},F${r})`);
    add(
      r,
      4,
      rows.length ? count / rows.length : 0,
      7,
      `IF($A$10=0,0,D${r}/$A$10)`,
    );
    span(r, 5, 6, name, 8);
  });
  visibleOwners.forEach((owner, i) => {
    const r = 35 + i;
    span(r, 7, 10, ownerLabels[i], 8);
    add(r, 14, owner.id);
    add(
      r,
      11,
      owner.count,
      6,
      `COUNTIFS(${ownerRange},${owner.id === 'UNASSIGNED' ? '"="' : `O${r}`})`,
    );
    add(
      r,
      12,
      rows.length ? owner.count / rows.length : 0,
      7,
      `IF($A$10=0,0,L${r}/$A$10)`,
    );
  });
  if (owners.length > 12) {
    span(47, 7, 10, 'Other owners');
    add(47, 11, ownerCounts.at(-1), 6, '$A$10-SUM(L35:L46)');
    add(
      47,
      12,
      ownerCounts.at(-1)! / rows.length,
      7,
      'IF($A$10=0,0,L47/$A$10)',
    );
  }
  const extraStart = Math.max(49, 36 + statuses.length);
  span(extraStart, 0, 3, report.extraLabel, 2);
  breakdown(rows, report.extra).forEach(([name, count], i) => {
    span(extraStart + i + 1, 0, 2, human(name), 8);
    add(extraStart + i + 1, 3, count, 6);
  });
  const metadataStart = extraStart + breakdown(rows, report.extra).length + 3;
  const metadata = [
    ['Client ID', report.filters.clientId || 'ALL_ACCESSIBLE'],
    ['Selected owner IDs', report.filters.ownerIds?.join('; ') || 'ALL_OWNERS'],
    ['Period basis', 'Created date (UTC)'],
    ['Source', 'ASTRA generated management report'],
  ];
  metadata.forEach(([name, value], i) => {
    span(metadataStart + i, 0, 2, name);
    span(metadataStart + i, 3, 13, value, 8);
  });
  const sheetRows = [...summaryRows]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([r, cells]) =>
        `<row r="${r}" ht="${r === 2 || r === 10 ? 30 : r === 6 ? Math.max(42, Math.ceil((report.ownerNames.join('; ').length + report.filters.q.length + 30) / 120) * 15) : 18}" customHeight="1">${cells.sort((a, b) => a.match(/r="([A-Z]+)/)![1].length - b.match(/r="([A-Z]+)/)![1].length || a.localeCompare(b)).join('')}</row>`,
    )
    .join('');
  const summary = part(
    `<worksheet xmlns="${ns}" xmlns:r="${rel}"><sheetPr><tabColor rgb="FF2563EB"/><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="85"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="14" width="11" customWidth="1"/><col min="15" max="15" width="40" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/>${rows.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`,
  );
  const headers: Record<string, string> = {
    [report.identifier]: 'Reference',
    [report.titleKey]: 'Title',
    client_name: 'Client',
    status: 'Status',
    [report.owner]: 'Owner',
    assigned_user_id: 'Owner ID',
    owner_user_id: 'Owner ID',
    priority: 'Priority',
    sla_status: 'SLA status',
    risk: 'Risk',
    created_at: 'Created (UTC)',
    updated_at: 'Updated (UTC)',
  };
  const recordRows = rows
    .map(
      (row, i) =>
        `<row r="${i + 5}" ht="${Math.min(409, Math.max(36, ...columns.map((key, j) => Math.ceil(String(row[key] ?? '').length / (j === 1 ? 50 : key.includes('_id') ? 36 : 23)) * 14)))}" customHeight="1">${columns.map((key, j) => cell(`${column(j)}${i + 5}`, key.endsWith('_at') ? excelDate(row[key]) : key === 'status' || key === report.extra ? (row[key] ?? 'Unassigned') : row[key], key.endsWith('_at') ? 5 : 8)).join('')}</row>`,
    )
    .join('');
  const records = part(
    `<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="1" ySplit="4" topLeftCell="B5" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols>${columns.map((key, j) => `<col min="${j + 1}" max="${j + 1}" width="${j === 1 ? 55 : key.includes('_id') ? 38 : key.endsWith('_at') ? 28 : 24}" customWidth="1"/>`).join('')}</cols><sheetData><row r="1" ht="30" customHeight="1">${cell('A1', 'ASTRA report records', 1)}</row><row r="2">${cell('A2', `Source: ASTRA ${report.title}. Created ${report.filters.from} through ${report.filters.to} (UTC).`, 4)}</row><row r="3">${cell('A3', `Generated ${report.generatedAt}. Complete filtered snapshot: ${rows.length} records.`, 4)}</row><row r="4" ht="30" customHeight="1">${columns.map((key, j) => cell(`${column(j)}4`, headers[key] || human(key), 2)).join('')}</row>${recordRows}</sheetData><autoFilter ref="A4:${column(columns.length - 1)}${Math.max(4, rows.length + 4)}"/><mergeCells count="3">${[1, 2, 3].map((r) => `<mergeCell ref="A${r}:${column(columns.length - 1)}${r}"/>`).join('')}</mergeCells><pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`,
  );
  const files: [string, string][] = [
    [
      '_rels/.rels',
      part(
        `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    ],
    [
      'xl/workbook.xml',
      part(
        `<workbook xmlns="${ns}" xmlns:r="${rel}"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Records" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'Summary'!$A$1:$N$33</definedName><definedName name="_xlnm.Print_Titles" localSheetId="1">'Records'!$4:$4</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
      ),
    ],
    [
      'xl/_rels/workbook.xml.rels',
      part(
        `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
      ),
    ],
    ['xl/styles.xml', styles],
    ['xl/worksheets/sheet1.xml', summary],
    ['xl/worksheets/sheet2.xml', records],
  ];
  if (rows.length) {
    const anchor = (id: number, start: number, end: number) =>
      `<xdr:twoCellAnchor><xdr:from><xdr:col>${start}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>14</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${end}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>31</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${id === 1 ? 'Status distribution' : 'Owner workload'}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    files.push(
      [
        'xl/worksheets/_rels/sheet1.xml.rels',
        part(
          `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
        ),
      ],
      [
        'xl/drawings/drawing1.xml',
        part(
          `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${rel}">${anchor(1, 0, 7)}${anchor(2, 7, 14)}</xdr:wsDr>`,
        ),
      ],
      [
        'xl/drawings/_rels/drawing1.xml.rels',
        part(
          `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/chart" Target="../charts/chart1.xml"/><Relationship Id="rId2" Type="${rel}/chart" Target="../charts/chart2.xml"/></Relationships>`,
        ),
      ],
      [
        'xl/charts/chart1.xml',
        barChart(
          'Records by status',
          statuses.map(([name]) => human(name)),
          statuses.map(([, count]) => count),
          'A',
          'D',
          colors[0],
          100,
        ),
      ],
      [
        'xl/charts/chart2.xml',
        barChart(
          'Records by owner',
          ownerLabels,
          ownerCounts,
          'H',
          'L',
          colors[1],
          200,
        ),
      ],
    );
  }
  const types = files
    .filter(([name]) => name.endsWith('.xml'))
    .map(([name]) => {
      const type = name.includes('/charts/')
        ? 'chart'
        : name.includes('/drawings/')
          ? 'drawing'
          : name.includes('/worksheets/')
            ? 'worksheet'
            : name.endsWith('styles.xml')
              ? 'styles'
              : 'sheet.main';
      return `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.${type === 'drawing' ? 'drawing' : `${type === 'chart' ? 'drawingml' : 'spreadsheetml'}.${type}`}+xml"/>`;
    })
    .join('');
  files.push([
    '[Content_Types].xml',
    part(
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>${types}</Types>`,
    ),
  ]);
  return zip(files);
}

export function createOverviewExcel(report: OverviewReport): Uint8Array {
  if (
    overviewModules.some((module) => report.modules[module.kind].length > 5000)
  )
    throw new Error(
      'Overview Excel supports up to 5,000 records per module. Narrow the filters.',
    );
  const numbers = overviewNumbers(report);
  const lifecycles = overviewLifecycle(report);
  const total = numbers.reduce((sum, module) => sum + module.total, 0);
  const summaryRows = new Map<number, string[]>();
  const add = (r: number, c: number, value: unknown, style = 0) => {
    const cells = summaryRows.get(r) ?? [];
    cells.push(cell(`${column(c)}${r}`, value, style));
    summaryRows.set(r, cells);
  };
  const merged = (r: number, value: unknown, style = 0) =>
    add(r, 0, value, style);
  merged(2, 'ASTRA | Holistic overview report', 1);
  merged(
    4,
    `Created ${report.filters.from} through ${report.filters.to} (UTC). Status, owner, SLA and risk are current values.`,
    8,
  );
  merged(
    5,
    `Client: ${report.clientName} | ID: ${report.filters.clientId || 'ALL_ACCESSIBLE'}`,
    8,
  );
  merged(6, `Search: ${report.filters.q || 'None'}`, 8);
  merged(7, `Generated (UTC): ${report.generatedAt}`, 4);
  merged(
    8,
    'Linked records count once in each module. Resolved / completed excludes cancelled, rejected, failed and rolled-back records.',
    4,
  );
  [
    'Module',
    'Total',
    'Active',
    'Resolved / completed',
    'Cancelled / rejected',
    'Failed / rolled back',
    'Attention indicator',
    'Attention count',
  ].forEach((value, c) => add(10, c, value, 2));
  numbers.forEach((module, i) =>
    [
      module.name,
      module.total,
      module.active,
      module.completed,
      module.cancelled,
      module.failed,
      module.indicator,
      module.attention,
    ].forEach((value, c) =>
      add(11 + i, c, value, typeof value === 'number' ? 6 : 8),
    ),
  );
  [
    'Overall',
    ...(['total', 'active', 'completed', 'cancelled', 'failed'] as const).map(
      (key) => numbers.reduce((sum, module) => sum + module[key], 0),
    ),
  ].forEach((value, c) => add(14, c, value, typeof value === 'number' ? 3 : 8));
  merged(
    16,
    total
      ? 'Graphical overview — charts use the numbers in the tables below.'
      : 'No matching records. The report contains complete zero totals.',
    4,
  );
  add(35, 0, 'Module', 2);
  add(35, 1, 'Records', 2);
  add(35, 3, 'Lifecycle', 2);
  add(35, 4, 'Records', 2);
  numbers.forEach((module, i) => {
    add(36 + i, 0, module.name, 8);
    add(36 + i, 1, module.total, 6);
  });
  lifecycles.forEach(([name, count], i) => {
    add(36 + i, 3, name, 8);
    add(36 + i, 4, count, 6);
  });
  let lastRow = 43;
  overviewModules.forEach((module, i) => {
    const offset = i * 3;
    add(42, offset, `${module.name} breakdown`, 2);
    add(42, offset + 1, 'Value', 2);
    add(42, offset + 2, 'Count', 2);
    let r = 43;
    for (const key of [
      'status',
      module.kind === 'tickets'
        ? 'sla_status'
        : module.kind === 'changes'
          ? 'risk'
          : 'priority',
    ]) {
      for (const [name, count] of breakdown(report.modules[module.kind], key)) {
        add(r, offset, human(key), 8);
        add(r, offset + 1, human(name), 8);
        add(r++, offset + 2, count, 6);
      }
    }
    lastRow = Math.max(lastRow, r);
  });
  const merges = [2, 4, 5, 6, 7, 8, 16]
    .map((r) => `<mergeCell ref="A${r}:I${r}"/>`)
    .join('');
  const summary = part(
    `<worksheet xmlns="${ns}" xmlns:r="${rel}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><cols><col min="1" max="1" width="29" customWidth="1"/><col min="2" max="6" width="23" customWidth="1"/><col min="7" max="9" width="28" customWidth="1"/></cols><sheetData>${[
      ...summaryRows,
    ]
      .sort((a, b) => a[0] - b[0])
      .map(
        ([r, cells]) =>
          `<row r="${r}" ht="${[4, 5, 6, 8, 10, 11, 12, 13, 42].includes(r) ? 45 : r === 2 ? 32 : 22}" customHeight="1">${cells.join('')}</row>`,
      )
      .join(
        '',
      )}</sheetData><mergeCells count="7">${merges}</mergeCells><pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>${total ? '<drawing r:id="rId1"/>' : ''}</worksheet>`,
  );
  const records = overviewRecords(report),
    headers = records[0];
  const files: [string, string][] = [
    [
      '_rels/.rels',
      part(
        `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    ],
    [
      'xl/workbook.xml',
      part(
        `<workbook xmlns="${ns}" xmlns:r="${rel}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${['Overview', 'Tickets', 'Changes', 'Problems'].map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'Overview'!$A$1:$I$${lastRow}</definedName></definedNames></workbook>`,
      ),
    ],
    [
      'xl/_rels/workbook.xml.rels',
      part(
        `<Relationships xmlns="${pkg}">${[1, 2, 3, 4].map((i) => `<Relationship Id="rId${i}" Type="${rel}/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')}<Relationship Id="rId5" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
      ),
    ],
    ['xl/styles.xml', styles],
    ['xl/worksheets/sheet1.xml', summary],
  ];
  overviewModules.forEach((module, i) => {
    const data = records.slice(1).filter((row) => row[0] === module.name);
    const titleRows = [
      `<row r="1" ht="32" customHeight="1">${cell('A1', `ASTRA ${module.name} records`, 1)}</row>`,
      `<row r="2" ht="36" customHeight="1">${cell('A2', `Created ${report.filters.from} through ${report.filters.to} (UTC) | Generated ${report.generatedAt} | ${data.length} records`, 8)}</row>`,
      `<row r="3" ht="38" customHeight="1">${headers.map((value, c) => cell(`${column(c)}3`, value, 2)).join('')}</row>`,
    ].join('');
    const rows = data
      .map(
        (row, r) =>
          `<row r="${r + 4}" ht="42" customHeight="1">${row.map((value, c) => cell(`${column(c)}${r + 4}`, c >= 13 ? excelDate(value) : value, c >= 13 ? 5 : 8)).join('')}</row>`,
      )
      .join('');
    files.push([
      `xl/worksheets/sheet${i + 2}.xml`,
      part(
        `<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${headers.map((_, c) => `<col min="${c + 1}" max="${c + 1}" width="${c === 3 ? 55 : [1, 5, 9].includes(c) ? 38 : 28}" customWidth="1"/>`).join('')}</cols><sheetData>${titleRows}${rows}</sheetData><autoFilter ref="A3:O${Math.max(3, data.length + 3)}"/><mergeCells count="2"><mergeCell ref="A1:O1"/><mergeCell ref="A2:O2"/></mergeCells><pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`,
      ),
    ]);
  });
  if (total) {
    const anchor = (id: number, start: number, end: number) =>
      `<xdr:twoCellAnchor><xdr:from><xdr:col>${start}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>17</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${end}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>33</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="Overview chart ${id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    files.push(
      [
        'xl/worksheets/_rels/sheet1.xml.rels',
        part(
          `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
        ),
      ],
      [
        'xl/drawings/drawing1.xml',
        part(
          `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${rel}">${anchor(1, 0, 4)}${anchor(2, 4, 9)}</xdr:wsDr>`,
        ),
      ],
      [
        'xl/drawings/_rels/drawing1.xml.rels',
        part(
          `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/chart" Target="../charts/chart1.xml"/><Relationship Id="rId2" Type="${rel}/chart" Target="../charts/chart2.xml"/></Relationships>`,
        ),
      ],
      [
        'xl/charts/chart1.xml',
        barChart(
          'Records by module',
          numbers.map((module) => module.name),
          numbers.map((module) => module.total),
          'A',
          'B',
          colors[0],
          100,
          'Overview',
          36,
        ),
      ],
      [
        'xl/charts/chart2.xml',
        barChart(
          'Current lifecycle',
          lifecycles.map(([name]) => name),
          lifecycles.map(([, count]) => count),
          'D',
          'E',
          colors[1],
          200,
          'Overview',
          36,
        ),
      ],
    );
  }
  files.push([
    '[Content_Types].xml',
    part(
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>${files
        .filter(([name]) => name.endsWith('.xml'))
        .map(([name]) => {
          const type = name.includes('/charts/')
            ? 'drawingml.chart'
            : name.includes('/drawings/')
              ? 'drawing'
              : name.includes('/worksheets/')
                ? 'spreadsheetml.worksheet'
                : name.endsWith('styles.xml')
                  ? 'spreadsheetml.styles'
                  : 'spreadsheetml.sheet.main';
          return `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`;
        })
        .join('')}</Types>`,
    ),
  ]);
  return zip(files);
}

export function downloadReportExcel(report: ExcelReport) {
  const bytes = createReportExcel(report);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = `astra-${report.kind}-report-${report.filters.from}-${report.filters.to}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
