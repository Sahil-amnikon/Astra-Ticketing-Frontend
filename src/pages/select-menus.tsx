import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './select-menus.css';

type Choice = { element: HTMLOptionElement; index: number; label: string; group: string; disabled: boolean; selected: boolean };
type Menu = { select: HTMLSelectElement; choices: Choice[]; active: number; left: number; top: number; width: number; height: number; fontSize: string; host: HTMLElement; label: string };

function choicesFor(select: HTMLSelectElement): Choice[] {
  return Array.from(select.options).flatMap((element, index) => {
    const group = element.parentElement instanceof HTMLOptGroupElement ? element.parentElement : null;
    if (element.hidden || group?.hidden) return [];
    return [{ element, index, label: element.label || element.textContent?.trim() || 'None', group: group?.label || '',
      disabled: element.disabled || !!group?.disabled, selected: element.selected }];
  });
}
function isDropdown(target: EventTarget | null): target is HTMLSelectElement {
  return target instanceof HTMLSelectElement && !target.hasAttribute('data-record-picker-native') && !target.multiple && target.size <= 1 && !target.matches(':disabled');
}
function enabledIndex(choices: Choice[], preferred: number) {
  return choices.some(choice => choice.index === preferred && !choice.disabled) ? preferred : choices.find(choice => !choice.disabled)?.index ?? -1;
}

/** Keep the actual selects, labels, browser validation and form events; replace only their OS popup. */
export default function SelectMenus() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const current = useRef<Menu | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const search = useRef({ text: '', time: 0 });
  const pointerControl = useRef<HTMLSelectElement | null>(null);
  function update(next: Menu | null) { current.current = next; setMenu(next); }
  function close() { update(null); search.current = { text: '', time: 0 }; }
  function activate(index: number) {
    const value = current.current;
    if (value && value.choices.some(choice => choice.index === index && !choice.disabled)) update({ ...value, active: index });
  }
  function choose(index: number) {
    const value = current.current;
    const choice = value?.choices.find(option => option.index === index);
    if (!value || !choice || !isDropdown(value.select) || !value.select.contains(choice.element)) return close();
    const group = choice.element.parentElement;
    if (choice.element.disabled || (group instanceof HTMLOptGroupElement && group.disabled)) return;
    const changed = !choice.element.selected;
    choice.element.selected = true;
    close();
    value.select.focus({ preventScroll: true });
    if (changed) {
      value.select.dispatchEvent(new Event('input', { bubbles: true }));
      value.select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function open(select: HTMLSelectElement, edge?: 'first' | 'last') {
    // Make room below the field rather than flipping its choices above it.
    if (window.innerHeight - select.getBoundingClientRect().bottom < 140) select.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = select.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const width = Math.min(Math.max(rect.width, 320), viewportWidth - 24);
    const choices = choicesFor(select);
    const enabled = choices.filter(choice => !choice.disabled);
    const active = edge === 'first' ? enabled[0]?.index ?? -1 : edge === 'last' ? enabled.at(-1)?.index ?? -1 : enabledIndex(choices, select.selectedIndex);
    const labels = Array.from(select.labels || []).map(label => {
      const copy = label.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('select, input, button, textarea').forEach(control => control.remove());
      return copy.textContent?.trim();
    }).filter(Boolean).join(' ');
    const labelledBy = (select.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
    select.focus({ preventScroll: true });
    update({ select, choices, active, left: Math.max(12, Math.min(rect.left, viewportWidth - width - 12)), top: rect.bottom + 6,
      width, height: Math.max(44, Math.min(300, window.innerHeight - rect.bottom - 18)), fontSize: getComputedStyle(select).fontSize,
      host: select.closest('dialog[open]') || document.body, label: labelledBy || select.getAttribute('aria-label') || labels || 'Choose an option' });
  }

  useEffect(() => {
    function pointer(event: PointerEvent) {
      pointerControl.current = null;
      if (isDropdown(event.target) && event.button === 0) {
        event.preventDefault();
        pointerControl.current = event.target;
        if (current.current?.select === event.target) close(); else open(event.target);
      } else if (!popup.current?.contains(event.target as Node)) close();
    }
    function preventNative(event: MouseEvent) {
      if (isDropdown(event.target) && event.button === 0) event.preventDefault();
    }
    function click(event: MouseEvent) {
      preventNative(event);
      // Labels and assistive technology can activate a control without its pointer event.
      if (isDropdown(event.target) && pointerControl.current !== event.target) {
        if (current.current?.select === event.target) close(); else open(event.target);
      }
      pointerControl.current = null;
    }
    function key(event: KeyboardEvent) {
      if (!isDropdown(event.target) || event.isComposing) return;
      const select = event.target;
      const value = current.current?.select === select ? current.current : null;
      if (event.key === 'Tab') { close(); return; }
      if (event.key === 'Escape') { if (value) { event.preventDefault(); event.stopPropagation(); close(); } return; }
      if (event.key === 'F4') { event.preventDefault(); if (value) close(); else open(select); return; }
      if (event.altKey && event.key === 'ArrowUp') { event.preventDefault(); close(); return; }
      if (event.ctrlKey || event.metaKey || (event.altKey && event.key !== 'ArrowDown')) return;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        if (!value) { open(select, event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : undefined); return; }
        if (event.key === 'Enter' || event.key === ' ') { choose(value.active); return; }
        const enabled = value.choices.filter(choice => !choice.disabled);
        const index = enabled.findIndex(choice => choice.index === value.active);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : Math.max(0, Math.min(enabled.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        if (enabled[next]) activate(enabled[next].index);
      } else if (event.key.length === 1 && !event.altKey) {
        event.preventDefault();
        if (!value) open(select);
        const now = Date.now();
        search.current = { text: (now - search.current.time < 700 ? search.current.text : '') + event.key.toLocaleLowerCase(), time: now };
        const choices = current.current?.choices.filter(choice => !choice.disabled) || [];
        const text = search.current.text;
        const repeated = text.length > 1 && [...text].every(letter => letter === text[0]);
        const term = repeated ? text[0] : text;
        const start = repeated ? choices.findIndex(choice => choice.index === current.current?.active) + 1 : 0;
        const ordered = [...choices.slice(start), ...choices.slice(0, start)];
        const match = ordered.find(choice => choice.label.toLocaleLowerCase().startsWith(term));
        if (match) activate(match.index);
      }
    }
    function focus(event: FocusEvent) { if (current.current && event.target !== current.current.select && !popup.current?.contains(event.target as Node)) close(); }
    function scroll(event: Event) {
      const value = current.current;
      if (!value || popup.current?.contains(event.target as Node)) return;
      const rect = value.select.getBoundingClientRect();
      const left = Math.max(12, Math.min(rect.left, document.documentElement.clientWidth - value.width - 12));
      if (Math.abs(rect.bottom + 6 - value.top) > 1 || Math.abs(left - value.left) > 1) close();
    }
    function reset() { close(); }
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('mousedown', preventNative, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('scroll', scroll, true);
    document.addEventListener('reset', reset, true);
    window.addEventListener('resize', reset);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('mousedown', preventNative, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('focusin', focus, true);
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('reset', reset, true);
      window.removeEventListener('resize', reset);
      window.removeEventListener('blur', reset);
    };
  }, []);

  useLayoutEffect(() => {
    if (!menu) return;
    const select = menu.select;
    const attributes = ['aria-expanded', 'aria-controls', 'aria-activedescendant'] as const;
    const original = attributes.map(name => select.getAttribute(name));
    select.setAttribute('aria-expanded', 'true');
    select.setAttribute('aria-controls', menuId);
    return () => attributes.forEach((name, index) => {
      if (original[index] === null) select.removeAttribute(name); else select.setAttribute(name, original[index]!);
    });
  }, [menu?.select, menuId]);
  useLayoutEffect(() => {
    if (!menu) return;
    if (menu.active >= 0) menu.select.setAttribute('aria-activedescendant', `${menuId}-${menu.active}`);
    else menu.select.removeAttribute('aria-activedescendant');
    const option = popup.current?.querySelector<HTMLElement>(`[data-index="${menu.active}"]`);
    if (option && popup.current) {
      // Scroll this list alone; scrollIntoView would also move the page underneath it.
      const top = option.offsetTop, bottom = top + option.offsetHeight;
      if (top < popup.current.scrollTop) popup.current.scrollTop = top;
      else if (bottom > popup.current.scrollTop + popup.current.clientHeight) popup.current.scrollTop = bottom - popup.current.clientHeight;
    }
  }, [menu?.active, menu?.choices, menuId]);
  useEffect(() => {
    if (!menu) return;
    const select = menu.select;
    function refresh() {
      const value = current.current;
      if (value?.select !== select) return;
      if (!isDropdown(select) || !select.isConnected) { close(); return; }
      const choices = choicesFor(select);
      update({ ...value, choices, active: enabledIndex(choices, value.active) });
    }
    const observer = new MutationObserver(refresh);
    observer.observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'label', 'value', 'selected'] });
    select.addEventListener('change', refresh);
    let selected = select.selectedIndex;
    let frame = 0;
    function check() {
      if (!select.isConnected || !isDropdown(select)) { close(); return; }
      if (selected !== select.selectedIndex) { selected = select.selectedIndex; refresh(); }
      frame = requestAnimationFrame(check);
    }
    frame = requestAnimationFrame(check);
    return () => { observer.disconnect(); select.removeEventListener('change', refresh); cancelAnimationFrame(frame); };
  }, [menu?.select]);

  if (!menu) return null;
  return createPortal(<div ref={popup} id={menuId} className="astra-select-menu" role="listbox" aria-label={menu.label}
    style={{ position: 'fixed', left: menu.left, top: menu.top, width: menu.width, maxHeight: menu.height, fontSize: menu.fontSize }}
    onPointerDown={event => { if (event.target instanceof Element && event.target.closest('.astra-select-option')) event.preventDefault(); }}>
    {menu.choices.map((choice, index) => <div key={choice.index}>
      {choice.group && choice.group !== menu.choices[index - 1]?.group && <div className="astra-select-group">{choice.group}</div>}
      <button type="button" tabIndex={-1} id={`${menuId}-${choice.index}`} role="option" data-index={choice.index}
        aria-selected={choice.selected} disabled={choice.disabled}
        className={`astra-select-option${choice.index === menu.active ? ' is-active' : ''}${choice.selected ? ' is-selected' : ''}`}
        onPointerMove={() => { if (current.current?.active !== choice.index) activate(choice.index); }} onClick={() => choose(choice.index)}>
        <span className="astra-select-option-label">{choice.label}</span><span className="astra-select-check" aria-hidden="true">{choice.selected ? '✓' : ''}</span>
      </button>
    </div>)}
    {!menu.choices.length && <p className="astra-select-empty">No options available.</p>}
  </div>, menu.host);
}
