# Management Excel reports

Management Tickets, Changes and Problems provide Download Excel after Generate report.
The first Summary worksheet contains the applied created-date UTC period, client,
status, search, owner selection and generation timestamp, four headline counts,
and native status and owner charts. The second Records worksheet contains the
complete authorized filtered snapshot, with owner UUIDs, filterable headers,
frozen reference/header panes and typed UTC timestamps. CSV downloads remain.

Generation runs locally in the browser from the existing generated report.
There are no additional API requests, storage or database changes. A lazy-loaded
OOXML writer packages a standard XLSX with CRC32-validated UTF-8 ZIP entries.
Record strings are inline text, never formulas. Invalid XML controls are removed.
The existing 5,000-record cap is enforced again by the exporter. Text exceeding
Excel's 32,767-character cell limit fails explicitly and suggests CSV.

Charts bind to Summary cells. Key counts and status/owner summaries use bounded
Records formulas with cached values and recalculate on opening in Excel.
The 12 largest owner workloads are plotted with remaining owners combined;
no Records rows are omitted. Duplicate owner names receive numeric labels,
with full UUIDs alongside the chart source table. The printable summary is
configured for one landscape A4 page. Detailed data may print over multiple pages.
SLA/risk/priority breakdowns and filter IDs remain available below the charts.

Validation: production build and strict TypeScript, targeted lint, browser QA
for all three tabs, single/multiple/unassigned owner filters, stale/access/oversize
export guards, native chart package and ZIP/relationship validation, independent
read-only workbook parsing, and graphical review of both sheets. Local QA uses
fixtures and makes no production writes. Desktop Microsoft Excel was not automated.
