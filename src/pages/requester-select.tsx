import { useEffect, useId, useRef, useState } from 'react';
import './requester-select.css';

type Row = Record<string, unknown>;
export function filterRequesters(contacts: Row[], search: string): Row[] {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return contacts.filter(person => {
    const text = `${person.name ?? ''} ${person.email ?? ''}`.toLowerCase();
    return terms.every(term => text.includes(term));
  });
}

export default function RequesterSelect({ contacts, value, onChange, disabled }: {
  contacts: Row[]; value: string[]; onChange: (ids: string[]) => void; disabled: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [height, setHeight] = useState(260);
  const matches = filterRequesters(contacts, search);
  const selected = value.map(id => contacts.find(person => String(person.id) === id)).filter((person): person is Row => !!person);
  function show() {
    const rect = trigger.current?.getBoundingClientRect();
    setHeight(Math.max(80, Math.min(260, window.innerHeight - (rect?.bottom ?? 0) - 16)));
    setOpen(true);
  }
  function choose(person: Row) {
    const personId = String(person.id);
    onChange(value.includes(personId) ? value.filter(id => id !== personId) : value.length < 50 ? [...value, personId] : value);
    trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id, search]);
  return <div ref={root} className="requester-select" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <label htmlFor={`${id}-user`}>Users</label>
    <div className="requester-select-search">
      <input type="search" aria-label="Search users by name or email" placeholder="Search user name or email…"
        value={search} disabled={disabled} onChange={event => { setSearch(event.target.value); setActive(0); show(); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive(0); show(); trigger.current?.focus(); }
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' && open) { event.preventDefault(); if (matches.length === 1) choose(matches[0]); else trigger.current?.focus(); }
        }} />
      {search && <button type="button" className="secondary" disabled={disabled} aria-label="Clear user search" onClick={() => { setSearch(''); setActive(0); }}>Clear</button>}
    </div>
    <div className="requester-select-control">
      <button ref={trigger} type="button" id={`${id}-user`} className="requester-select-trigger" role="combobox"
        aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-required="true"
        aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
        disabled={disabled} aria-describedby={`${id}-count`} onClick={() => { if (open) setOpen(false); else { setActive(0); show(); } }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); const direction = event.key === 'ArrowDown' ? 1 : -1;
            setActive(open ? Math.max(0, Math.min(matches.length - 1, active + direction)) : direction === 1 ? 0 : Math.max(0, matches.length - 1)); show();
          } else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
          else if ((event.key === 'Enter' || event.key === ' ') && open) { event.preventDefault(); if (matches[active]) choose(matches[active]); }
          else if (open && (event.key === 'Home' || event.key === 'End')) { event.preventDefault(); setActive(event.key === 'Home' ? 0 : Math.max(0, matches.length - 1)); }
        }}>
        <span>{selected.length > 1 ? `${selected.length} users selected` : selected[0] ? `${selected[0].name}${selected[0].email ? ` — ${selected[0].email}` : ''}` : disabled ? 'Select a client first' : 'Select users…'}</span><span aria-hidden="true">▾</span>
      </button>
      {open && <div id={`${id}-list`} className="requester-select-list" role="listbox" aria-label="Users" aria-multiselectable="true" style={{ maxHeight: height }}>
        {!matches.length && <p role="status">No matching users. Try another name or email.</p>}
        {matches.map((person, index) => <button key={String(person.id)} id={`${id}-option-${index}`} type="button"
          role="option" tabIndex={-1} aria-selected={value.includes(String(person.id))}
          className={index === active ? 'is-active' : ''} onClick={() => choose(person)}>
          <span className="requester-option-check" aria-hidden="true">{value.includes(String(person.id)) ? '✓' : ''}</span><strong>{String(person.name)}</strong>{Boolean(person.email) && <small>{String(person.email)}</small>}
        </button>)}
      </div>}
    </div>
    {selected.length > 0 ? <div className="requester-selected-users" aria-label="Selected users">{selected.map((person, index) => <span key={String(person.id)} className="requester-selected-chip"><span>{String(person.name)}{index === 0 ? ' · Primary' : ''}</span><button type="button" disabled={disabled} aria-label={`Remove ${person.name}`} onClick={() => onChange(value.filter(id => id !== String(person.id)))}>×</button></span>)}</div> : null}
    <small className="field-help">Select up to 50 users. The first is the primary requester.</small>
    <small id={`${id}-count`} role="status">{disabled ? 'Choose a client with users.' :
      search ? `${matches.length.toLocaleString()} matching users` : `${contacts.length.toLocaleString()} users`}</small>
  </div>;
}
