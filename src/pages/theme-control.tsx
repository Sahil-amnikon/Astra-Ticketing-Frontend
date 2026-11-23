'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ThemeControl() {
  const [dark, setDark] = useState(false);
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem('astra-theme');
      } catch {
        /* Storage can be unavailable in a restricted browser context. */
      }
      const next = saved === 'dark' || (saved !== 'light' && media.matches);
      root.dataset.theme = next ? 'dark' : 'light';
      setDark(next);
    };
    const locate = () =>
      setHost(
        document.querySelector(
          '.topbar .profile, .workspace-frame-topbar .workspace-frame-actions',
        ) ?? document.querySelector('.topbar'),
      );
    apply();
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('storage', apply);
    media.addEventListener('change', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', apply);
      media.removeEventListener('change', apply);
    };
  }, []);
  const control = (
    <button
      type="button"
      className={`theme-control ${host ? '' : 'theme-control-floating'}`}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      title={`Switch to ${dark ? 'light' : 'dark'} mode`}
      aria-pressed={dark}
      onClick={() => {
        const next = !dark;
        document.documentElement.dataset.theme = next ? 'dark' : 'light';
        try {
          localStorage.setItem('astra-theme', next ? 'dark' : 'light');
        } catch {
          /* Keep the current-tab preference when storage is unavailable. */
        }
        setDark(next);
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
          </>
        ) : (
          <path d="M20.8 13.2A9 9 0 0 1 10.8 3a9 9 0 1 0 10 10.2Z" />
        )}
      </svg>
    </button>
  );
  return host ? createPortal(control, host) : control;
}
