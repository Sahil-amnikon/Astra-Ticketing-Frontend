import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Request, Row } from './record-form';
import './directory-record-picker.css';

type Props = {
  resource: string; label: string; value: string;
  onChange: (value: string, record?: Row) => void; request: Request;
  clientId?: string; selectedLabel?: string; filterOptions?: (row: Row) => boolean;
  optional?: boolean; disabled?: boolean; searchable?: boolean; emptyLabel?: string;
  allLabel?: string; onSelectAll?: () => void; activeOnly?: boolean;
};
const title = (row: Row) => String(row.name ?? row.display_name ?? row.email ?? 'Unnamed');

/** A single field with search, paging and choices inside its menu. */
export default function RecordPicker({ resource, label, value, onChange, request, clientId,
  selectedLabel, filterOptions, optional = false, disabled = false, searchable = true,
  emptyLabel, allLabel, onSelectAll, activeOnly = false }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, Row>());
  const currentValue = useRef(value);
  currentValue.current = value;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<{ items: Row[]; total: number }>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<Row>();
  const [position, setPosition] = useState({ left: 0, top: 0, width: 300, maxHeight: 360 });
  const rows = filterOptions ? data.items.filter(filterOptions) : data.items;
  const placeholder = emptyLabel ?? (optional ? 'None' : 'Select…');
  const choices = [
    ...(optional ? [{ id: '', text: placeholder, row: undefined as Row | undefined, all: false }] : []),
    ...(allLabel && onSelectAll ? [{ id: '__all__', text: allLabel, row: undefined as Row | undefined, all: true }] : []),
    ...(!loading && !error ? rows.map(row => ({ id: String(row.id), text: title(row), row, all: false })) : []),
  ];
  const displayed = selected && String(selected.id) === value ? title(selected) : selectedLabel ?? 'Current selection';
  function close(restore = false) {
    setOpen(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  }
  function show() {
    if (!trigger.current || trigger.current.matches(':disabled')) return;
    if (window.innerHeight - trigger.current.getBoundingClientRect().bottom < 240)
      trigger.current.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(rect.width, document.documentElement.clientWidth - 24);
    setPosition({ left: Math.max(12, Math.min(rect.left, document.documentElement.clientWidth - width - 12)),
      top: rect.bottom + 5, width, maxHeight: Math.max(100, Math.min(360, window.innerHeight - rect.bottom - 17)) });
    setSearch(''); setPage(1); setActive(0); setOpen(true);
  }
  function choose(index: number) {
    if (trigger.current?.matches(':disabled')) return close();
    const choice = choices[index];
    if (!choice) return;
    if (choice.all) onSelectAll?.();
    else { setSelected(choice.row); onChange(choice.id, choice.row); }
    close(true);
  }
  useEffect(() => {
    let live = true;
    setLoading(true); setError(''); setData({ items: [], total: 0 }); setActive(0);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ pageSize: '50', page: String(page), q: search });
      if (clientId) params.set('clientId', clientId);
      if (activeOnly) params.set('status', 'active');
      void request(`/admin/${resource}?${params}`).then(result => {
        if (!live) return;
        const next = result as typeof data;
        if (!Array.isArray(next.items) || typeof next.total !== 'number') throw new Error('Invalid options');
        next.items.forEach(row => cache.current.set(String(row.id), row));
        setSelected(cache.current.get(currentValue.current)); setData(next);
      }).catch(() => { if (live) setError('Could not load options. Please retry.'); })
        .finally(() => { if (live) setLoading(false); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [resource, page, search, clientId, request, activeOnly, retry]);
  useEffect(() => {
    setSelected(cache.current.get(value));
    if (!value || cache.current.has(value) || selectedLabel) return;
    let live = true;
    void request(`/admin/${resource}?pageSize=1&q=${encodeURIComponent(value)}`).then(result => {
      const row = (result as { items: Row[] }).items?.find(item => String(item.id) === value);
      if (live && row) { cache.current.set(value, row); setSelected(row); }
    }).catch(() => {});
    return () => { live = false; };
  }, [value, resource, selectedLabel, request]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    (searchInput.current ?? popup.current)?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (event.target instanceof Node && !popup.current?.contains(event.target) && !trigger.current?.contains(event.target)) close();
    };
    const scroll = (event: Event) => { if (event.target instanceof Node && !popup.current?.contains(event.target)) close(); };
    const resize = () => close();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  useEffect(() => {
    if (open) popup.current?.querySelector(`[data-choice-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  const host = open ? trigger.current?.closest('dialog[open]') ?? document.body : null;
  return <div className="picker directory-picker">
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>{label}</label>
    <button id={`${id}-trigger`} ref={trigger} type="button" className="directory-picker-trigger"
      role="combobox" aria-labelledby={`${id}-label`} aria-expanded={open} aria-controls={`${id}-list`}
      aria-haspopup="listbox" aria-required={!optional} aria-activedescendant={open && choices[active] ? `${id}-option-${active}` : undefined} disabled={disabled}
      onClick={() => open ? close() : show()} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); }
        if (event.key === 'Escape') close();
      }}><span>{value ? displayed : placeholder}</span><span aria-hidden="true">⌄</span></button>
    <select data-record-picker-native className="directory-picker-validation" tabIndex={-1} aria-hidden="true"
      value={value} required={!optional} disabled={disabled} onChange={event => onChange(event.target.value)}
      onInvalid={event => { event.preventDefault(); show(); }}>
      <option value="">{placeholder}</option>{value ? <option value={value}>{displayed}</option> : null}
    </select>
    {open && host ? createPortal(<div ref={popup} className="directory-picker-popup" style={position}
      tabIndex={-1} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setActive(index => Math.max(0, Math.min(choices.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        } else if (event.key === 'Enter' && (event.target === searchInput.current || event.target === popup.current)) {
          event.preventDefault(); choose(active);
        } else if (event.key === 'Tab') { close(); trigger.current?.focus({ preventScroll: true }); }
      }}>
      {searchable ? <input ref={searchInput} className="directory-picker-search" aria-label={`Search ${label}`}
        role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={choices[active] ? `${id}-option-${active}` : undefined}
        placeholder={`Search ${label.toLowerCase()}…`} value={search}
        onChange={event => { setSearch(event.target.value); setPage(1); }} /> : null}
      <div role="listbox" id={`${id}-list`} aria-labelledby={`${id}-label`} aria-busy={loading} className="directory-picker-options">
        {choices.map((choice, index) => <div role="option" aria-selected={choice.id === value} tabIndex={-1}
          id={`${id}-option-${index}`} data-choice-index={index} key={choice.id}
          className={`directory-picker-option${index === active ? ' is-active' : ''}`}
          onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}>
          <span>{choice.text}</span>{choice.row?.email && String(choice.row.email) !== choice.text ? <small>{String(choice.row.email)}</small> : null}
          {choice.id === value ? <span className="directory-picker-tick" aria-hidden="true">✓</span> : null}
        </div>)}
        {loading ? <p role="status">Loading options…</p> : error ? <p role="alert">{error}</p> : !rows.length ? <p role="status">No matching options.</p> : null}
      </div>
      {error ? <button type="button" onClick={() => setRetry(count => count + 1)}>Retry</button> : null}
      {data.total > 50 ? <div className="directory-picker-pager">
        <button type="button" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>{page} / {Math.ceil(data.total / 50)}</span>
        <button type="button" disabled={loading || page * 50 >= data.total} onClick={() => setPage(page + 1)}>Next</button>
      </div> : null}
    </div>, host) : null}
  </div>;
}
