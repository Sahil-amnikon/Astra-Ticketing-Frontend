'use client';
import { useLayoutEffect, useRef } from 'react';

const key = 'amnikon:workspace-nav-scroll';

export function useSidebarScroll(active: string, ready: boolean) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!ready || !ref.current) return;
    const nav = ref.current;
    try {
      nav.scrollTop = Number(sessionStorage.getItem(key)) || 0;
    } catch {
      // Private browsing may disable session storage.
    }
    const selected = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (selected) {
      const bounds = selected.getBoundingClientRect();
      const visible = nav.getBoundingClientRect();
      if (bounds.top < visible.top) nav.scrollTop -= visible.top - bounds.top;
      else if (bounds.bottom > visible.bottom)
        nav.scrollTop += bounds.bottom - visible.bottom;
    }
    const remember = () => {
      try {
        sessionStorage.setItem(key, String(nav.scrollTop));
      } catch {
        // Navigation still works when storage is unavailable.
      }
    };
    nav.addEventListener('scroll', remember, { passive: true });
    return () => {
      remember();
      nav.removeEventListener('scroll', remember);
    };
  }, [active, ready]);
  return ref;
}
