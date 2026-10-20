# Holistic Reports and Analytics

The Management and Administration Reports & Analytics pages now include a combined overview for Tickets, Change Management and Problem Management, above the existing technician activity reports.

Choose an inclusive UTC created-date range (maximum one year), a client or all accessible clients, and an optional search. Generate overview collects every page for all three modules using the existing authorized list APIs. The overview is published only when all three collections succeed. Permission failures, changing totals, duplicate pages and selections above 5,000 accessible records per module refuse a partial report. Existing API authorization remains authoritative.

The overview contains overall and module counts, active records, resolved/completed records, cancelled/rejected records, failed/rolled-back changes, status charts and module-specific attention indicators. Ticket attention means current SLA AT_RISK/BREACHED; change attention means current HIGH/CRITICAL risk; problem attention means current KNOWN_ERROR status. These indicators are not added together as one risk measure. Closed tickets/problems and completed/closed changes count as resolved/completed; unsuccessful terminal outcomes remain separate.

Each record counts once in its own module. Linked records are distinct tickets, changes or problems and are counted in each relevant module. All fields except the created-period selection represent values at generation; this overview is not a historical status or assignment attribution report. The technician activity report below retains its independent filters and historical assignment/transfer basis.

Downloads all use the same generated snapshot:

- Excel: Overview sheet with two native editable charts, overall numbers, status/indicator breakdowns, and separate Tickets, Changes and Problems record sheets. Dates are typed as UTC Excel dates; record text is never an executable formula.
- PNG: high-resolution graphical overview with module/lifecycle charts, numbers, indicators and three status charts.
- SVG: scalable graphical overview with the same report content.
- Overall numbers CSV: report metadata, module totals, overall totals and breakdown counts.
- Combined records CSV: metadata and a unified table including module, IDs, reference, title, client, status, lifecycle, owner, priority, SLA/risk and timestamps. CSV escapes formula-leading text.

Changing filters disables all downloads until successful regeneration. Failed generation clears the previous snapshot. Empty results produce complete zero-count downloads. Graphical PNG uses a data image compatible with the application's current content security policy. No policy relaxation, dependencies, backend changes or database migrations are required.

Validation is recorded in the release's validation.json and outputs/astra-holistic-reports-qa. Isolated browser fixtures validate Management and Administration routes, complete pagination, client filters, all five downloads, mobile layout, dirty filters, empty results, permission/size failures, and the Operations workspace guard. Unit checks cover lifecycle semantics and UTC boundaries. Workbook checks verify ZIP/XML integrity, internal relationships, native chart references/cache totals, four sheets, typed dates, zero and 15,000-record selections and existing module exports. Fixture values are not live business data.
