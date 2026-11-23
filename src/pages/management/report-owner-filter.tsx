'use client';
import { useEffect, useRef, useState } from 'react';
import type { ApiRequest } from '../workspace-tools';
import {
  collectReport,
  reportOwners,
  type ReportFilters,
  type ReportKind,
} from './module-report-data';

type Owner = { id: string; name: string; count: number };
export default function ReportOwnerFilter({
  kind,
  filters,
  request,
  disabled,
  onChange,
  onOwnersLoaded,
}: {
  kind: ReportKind;
  filters: ReportFilters;
  request: ApiRequest;
  disabled: boolean;
  onChange: (ids: string[]) => void;
  onOwnersLoaded: (owners: Owner[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const element = picker.current;
    const form = element?.closest('form');
    const close = () => {
      if (element) element.open = false;
    };
    const outside = (event: Event) => {
      if (event.target instanceof Node && !element?.contains(event.target))
        close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && element?.open) {
        event.preventDefault();
        close();
        element?.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    form?.addEventListener('submit', close, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
      form?.removeEventListener('submit', close, true);
    };
  }, []);
  const [data, setData] = useState<{ key: string; owners: Owner[] }>();
  const [error, setError] = useState<{ key: string; message: string }>();
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([
    kind,
    filters.from,
    filters.to,
    filters.clientId,
    filters.status,
    filters.q,
  ]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const abort = new AbortController();
    const [, from, to, clientId, status, q] = JSON.parse(key) as string[];
    void collectReport(
      request,
      kind,
      { from, to, clientId, status, q },
      abort.signal,
    )
      .then((rows) => {
        if (live) {
          const loaded = reportOwners(rows, kind);
          setData({ key, owners: loaded });
          onOwnersLoaded(loaded);
          setError(undefined);
        }
      })
      .catch((e) => {
        if (live && e.name !== 'AbortError')
          setError({ key, message: e.message });
      });
    return () => {
      live = false;
      abort.abort();
    };
  }, [open, key, kind, request, revision, onOwnersLoaded]);
  const selected = filters.ownerIds ?? [];
  const owners = data?.key === key ? data.owners : [];
  const currentError = error?.key === key ? error.message : '';
  const pending = data?.key !== key && !currentError;
  const missing = selected.filter(
    (id) => !owners.some((owner) => owner.id === id),
  );
  return (
    <div className="report-owner-field">
      <span className="report-owner-field-label">
        {kind === 'tickets' ? 'Owner / assigned technician' : 'Owner'}
      </span>
      <details
        ref={picker}
        className="report-owner-picker"
        onToggle={(e) => setOpen(e.currentTarget.open)}
      >
        <summary
          aria-expanded={open}
          aria-disabled={disabled}
          onClick={(e) => {
            if (disabled) e.preventDefault();
          }}
        >
          <span>
            {selected.length
              ? `${selected.length} owner${selected.length === 1 ? '' : 's'} selected`
              : 'All owners'}
          </span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className="report-owner-menu">
          <div className="report-owner-menu-heading">
            <strong>Select owners</strong>
            <button
              type="button"
              className="secondary"
              disabled={disabled || !selected.length}
              onClick={() => onChange([])}
            >
              Clear selection
            </button>
          </div>
          <p className="hint">
            Choose one or several. No selection includes all owners. Choices
            come from records matching your other filters.
          </p>
          {pending ? (
            <p role="status">Loading available owners…</p>
          ) : currentError ? (
            <div role="alert">
              <p>{currentError}</p>
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={() => {
                  setError(undefined);
                  setRevision((value) => value + 1);
                }}
              >
                Retry owners
              </button>
            </div>
          ) : (
            <div className="report-owner-options">
              {owners.map((owner) => {
                const duplicateName =
                  owners.filter((other) => other.name === owner.name).length >
                  1;
                return (
                  <label className="report-owner-option" key={owner.id}>
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={selected.includes(owner.id)}
                      onChange={(e) =>
                        onChange(
                          e.target.checked
                            ? [...selected, owner.id]
                            : selected.filter((id) => id !== owner.id),
                        )
                      }
                    />
                    <span>
                      {owner.name}
                      {duplicateName ? (
                        <small>User ID: {owner.id}</small>
                      ) : null}
                    </span>
                    <b>{owner.count}</b>
                  </label>
                );
              })}
              {!owners.length ? (
                <p>No owners found for these filters.</p>
              ) : null}
            </div>
          )}
          {!pending && !currentError && missing.length ? (
            <p role="status" className="hint">
              {missing.length} selected owner(s) have no records under these
              filters. Clear the selection to include all available owners.
            </p>
          ) : null}
          <small>Selection applies when you generate the report.</small>
          <button
            type="button"
            className="primary report-owner-done"
            onClick={() => {
              if (picker.current) picker.current.open = false;
              picker.current?.querySelector('summary')?.focus();
            }}
          >
            Done
          </button>
        </div>
      </details>
    </div>
  );
}
