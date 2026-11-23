import { useEffect, useId, useRef, useState } from 'react';
import './change-template-picker.css';

export function ChangeTemplateChoices({ templates, value, choose, remove, canDelete }: {
  templates: { id: string; name: string }[]; value: string; choose: (id: string) => void; remove: (id: string) => void; canDelete: boolean;
}) {
  return <>
    <div className="change-template-row"><button className="change-template-choice" type="button" aria-pressed={!value} onClick={() => choose('')}><span>Start without a template</span>{!value ? <span aria-hidden="true">✓</span> : null}</button></div>
    {templates.map(template => <div key={template.id} className="change-template-row">
      <button type="button" className="change-template-choice" aria-pressed={value === template.id} onClick={() => choose(template.id)}><span>{template.name}</span>{value === template.id ? <span aria-hidden="true">✓</span> : null}</button>
      {canDelete ? <button type="button" className="change-template-trash" aria-label={`Delete template ${template.name}`} title={`Delete template ${template.name}`} onClick={() => remove(template.id)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>
      </button> : null}
    </div>)}
  </>;
}

export default function ChangeTemplatePicker({ templates, value, onChange, onDelete, canDelete, disabled }: {
  templates: { id: string; name: string }[]; value: string; onChange: (id: string, form: HTMLFormElement | null) => void;
  onDelete: (id: string) => Promise<void>; canDelete: boolean; disabled: boolean;
}) {
  const id = useId(); const root = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  function choose(next: string) { onChange(next, trigger.current?.form ?? null); setOpen(false); trigger.current?.focus(); }
  return <div className="change-template-picker" ref={root} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>Start from a saved plan</label>
    <button ref={trigger} id={`${id}-trigger`} type="button" className="change-template-picker-trigger" disabled={disabled}
      aria-expanded={open} aria-haspopup="dialog" aria-controls={`${id}-choices`} onClick={() => setOpen(current => !current)}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.change-template-choice')?.focus()); } }}>
      <span>{templates.find(item => item.id === value)?.name ?? 'Start without a template'}</span><span aria-hidden="true">⌄</span>
    </button>
    {open ? <div className="change-template-choices" id={`${id}-choices`} role="dialog" aria-labelledby={`${id}-label`}>
      <ChangeTemplateChoices templates={templates} value={value} choose={choose} canDelete={canDelete} remove={templateId => { setOpen(false); trigger.current?.focus(); void onDelete(templateId); }} />
    </div> : null}
  </div>;
}
