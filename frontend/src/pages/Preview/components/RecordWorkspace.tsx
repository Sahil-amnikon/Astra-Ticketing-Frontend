'use client';
import { useState } from 'react';
import Dialog from '../../../components/ui/Dialog';
import MetricCard from '../../../components/ui/MetricCard';
import UiIcon from '../../../components/ui/UiIcon';
import {
  type RecordItem,
  type ModuleId,
  records,
  changes,
  problems,
} from '../data/fixtures';
import { Status } from './TicketQueue';
import { exportCsv } from '../../../utils/exportCsv';

export default function RecordWorkspace({
  module,
  notify,
}: {
  module: ModuleId;
  notify: (text: string) => void;
}) {
  const isChange = module === 'changes';
  const isProblem = module === 'problems';
  const audit = module === 'audit';
  const config = records[module] ?? {
    singular: isChange ? 'change' : 'problem',
    description: '',
    columns: [
      isChange ? 'Change request' : 'Problem',
      'Client / category',
      isChange ? 'Schedule' : 'Owner',
    ] as [string, string, string],
    rows: isChange ? changes : problems,
  };
  const [rows, setRows] = useState<RecordItem[]>(config.rows);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<RecordItem | null | undefined>();
  const [detail, setDetail] = useState<RecordItem | null>(null);
  const [remove, setRemove] = useState<RecordItem | null>(null);
  const filtered = rows.filter((row) =>
    `${row.id} ${row.name} ${row.detail} ${row.extra}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="corporate-metrics spark-three-metrics">
        <MetricCard
          label={
            isChange
              ? 'Total changes'
              : isProblem
                ? 'Total problems'
                : `Total ${module === 'sla' ? 'policies' : module.replaceAll('-', ' ')}`
          }
          value={rows.length}
          icon={<UiIcon name={isChange || isProblem ? 'change' : 'grid'} />}
        />
        <MetricCard
          label={
            isChange
              ? 'Awaiting approval'
              : isProblem
                ? 'Under investigation'
                : 'Active records'
          }
          value={
            rows.filter((r) =>
              isChange
                ? r.status === 'Pending review'
                : isProblem
                  ? r.status === 'Investigating'
                  : r.status === 'Active',
            ).length
          }
          tone="teal"
          icon={<UiIcon name="check" />}
        />
        <MetricCard
          label={
            isChange
              ? 'Scheduled'
              : isProblem
                ? 'Known errors'
                : 'Needs attention'
          }
          value={
            rows.filter((r) =>
              isChange
                ? r.status === 'Planned'
                : isProblem
                  ? r.status === 'Known error'
                  : r.status !== 'Active' && r.status !== 'Recorded',
            ).length
          }
          tone="amber"
          icon={<UiIcon name="clock" />}
        />
      </div>
      <section className="panel spark-data-panel">
        <div className="spark-table-toolbar">
          <label className="spark-search-field">
            <UiIcon name="search" />
            <input
              aria-label={`Search ${module}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${config.singular}s...`}
            />
          </label>
          <button
            className="secondary"
            onClick={() => {
              exportCsv(
                `astra-${module}-sample.csv`,
                filtered.map((r) => ({
                  Reference: r.id,
                  Name: r.name,
                  Details: r.detail,
                  Configuration: r.extra,
                  Status: r.status,
                })),
              );
              notify('Sample records exported.');
            }}
          >
            <UiIcon name="reports" />
            Export
          </button>
          {!audit && (
            <button className="primary" onClick={() => setEditor(null)}>
              + Add {config.singular}
            </button>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">{module} sample records</caption>
            <thead>
              <tr>
                {config.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      className="spark-ticket-title"
                      onClick={() => setDetail(row)}
                    >
                      <strong>{row.name}</strong>
                      <span>{row.id}</span>
                    </button>
                  </td>
                  <td>{row.detail}</td>
                  <td>{row.extra}</td>
                  <td>
                    <Status value={row.status} />
                  </td>
                  <td>
                    <div className="spark-row-actions">
                      <button
                        className="text-button"
                        onClick={() =>
                          audit ? setDetail(row) : setEditor(row)
                        }
                      >
                        {audit ? 'View' : 'Edit'}
                      </button>
                      {!audit && (
                        <button
                          className="spark-delete-button"
                          aria-label={`Delete ${row.name}`}
                          onClick={() => setRemove(row)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="spark-empty">
              <h3>No matching records</h3>
              <p>Try another search.</p>
            </div>
          )}
        </div>
        <footer className="spark-table-footer">
          <span>{filtered.length} records</span>
          <span>
            {audit ? 'Read-only audit history' : 'Fictional preview records'}
          </span>
        </footer>
      </section>
      {editor !== undefined && (
        <Dialog
          title={`${editor ? 'Edit' : 'Add'} ${config.singular}`}
          onClose={() => setEditor(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const row = {
                id: editor?.id ?? `DEMO-${Date.now()}`,
                name: String(d.get('name')).trim(),
                detail: String(d.get('detail')).trim(),
                extra: String(d.get('extra')).trim(),
                status: String(d.get('status')),
              };
              setRows((current) =>
                editor
                  ? current.map((r) => (r.id === editor.id ? row : r))
                  : [row, ...current],
              );
              setEditor(undefined);
              notify(
                `${config.singular[0].toUpperCase() + config.singular.slice(1)} ${editor ? 'updated' : 'created'} in this preview.`,
              );
            }}
          >
            {config.columns.map((label, i) => (
              <label className="spark-field" key={label}>
                {label}
                <input
                  name={['name', 'detail', 'extra'][i]}
                  defaultValue={
                    editor?.[(['name', 'detail', 'extra'] as const)[i]] ?? ''
                  }
                  required
                  maxLength={180}
                  type={label === 'Email address' ? 'email' : 'text'}
                />
              </label>
            ))}
            <label className="spark-field">
              Status
              <select
                name="status"
                defaultValue={
                  editor?.status ??
                  (isChange ? 'Draft' : isProblem ? 'Investigating' : 'Active')
                }
              >
                {(isChange
                  ? [
                      'Draft',
                      'Pending review',
                      'Approved',
                      'Planned',
                      'Completed',
                    ]
                  : isProblem
                    ? ['Investigating', 'Known error', 'Resolved']
                    : ['Active', 'Inactive', 'Pending review']
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditor(undefined)}
              >
                Cancel
              </button>
              <button className="primary">Save {config.singular}</button>
            </div>
          </form>
        </Dialog>
      )}
      {detail && (
        <Dialog title={detail.name} onClose={() => setDetail(null)}>
          <div className="spark-detail-heading">
            <span className="eyebrow">{detail.id}</span>
            <Status value={detail.status} />
          </div>
          <dl className="spark-record-details">
            {config.columns.map((label, i) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{detail[(['name', 'detail', 'extra'] as const)[i]]}</dd>
              </div>
            ))}
          </dl>
          {isChange && (
            <>
              <h3>Implementation plan</h3>
              <p>
                Validate the maintenance window, notify stakeholders, capture a
                rollback point, and verify service health after implementation.
              </p>
              <h3>Approval</h3>
              <p>
                Review by the assigned change approval board before the
                scheduled maintenance window.
              </p>
            </>
          )}
          {isProblem && (
            <>
              <h3>Investigation</h3>
              <p>
                Review linked incidents, compare event timelines, and document
                the root cause and workaround.
              </p>
              <h3>Next step</h3>
              <p>
                Confirm the permanent resolution and monitor for recurrence.
              </p>
            </>
          )}
          <p className="spark-sample-note">
            This record is fictional and exists only in the UI preview.
          </p>
        </Dialog>
      )}
      {remove && (
        <Dialog
          title={`Remove ${config.singular}?`}
          onClose={() => setRemove(null)}
        >
          <p>
            Remove <strong>{remove.name}</strong> from this sample workspace?
          </p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setRemove(null)}>
              Cancel
            </button>
            <button
              className="danger-button"
              onClick={() => {
                setRows(rows.filter((r) => r.id !== remove.id));
                setRemove(null);
                notify('Sample record removed.');
              }}
            >
              Remove record
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
