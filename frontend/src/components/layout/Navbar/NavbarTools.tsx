'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useColorMode } from '../../../context/ColorModeContext';
import UiIcon from '../../ui/UiIcon';
import Dialog from '../../ui/Dialog';

export function ThemeToggleButton() {
  const { mode, toggleColorMode } = useColorMode();
  return (
    <button
      type="button"
      className="spark-icon-button workspace-theme-toggle"
      onClick={toggleColorMode}
      aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
      title="Change appearance"
    >
      {mode === 'light' ? '☾' : '☀'}
    </button>
  );
}

export default function NavbarTools() {
  const { mode, toggleColorMode } = useColorMode();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [links, setLinks] = useState<{ href: string; label: string }[]>([]);
  function showSearch() {
    setLinks(
      Array.from(
        document.querySelectorAll<HTMLAnchorElement>('.sidebar nav a'),
      ).map((a) => ({
        href: a.getAttribute('href') ?? '/',
        label: a.textContent?.trim() ?? '',
      })),
    );
    setQuery('');
    setOpen(true);
  }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        showSearch();
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  return (
    <>
      <div className="spark-navbar-tools">
        <button
          className="spark-search-trigger"
          onClick={showSearch}
          aria-label="Search workspace navigation"
        >
          <UiIcon name="search" />
          <span>Search workspace...</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>
      {open && (
        <Dialog title="Find a workspace page" onClose={() => setOpen(false)}>
          <label className="spark-field">
            Search navigation
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tickets, clients, reports..."
            />
          </label>
          <div className="spark-command-results">
            {links
              .filter((link) =>
                link.label.toLowerCase().includes(query.toLowerCase()),
              )
              .map((link) => (
                <Link
                  href={link.href}
                  key={link.href}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                  <span>↗</span>
                </Link>
              ))}
          </div>
          {!links.some((link) =>
            link.label.toLowerCase().includes(query.toLowerCase()),
          ) && <p className="empty">No matching pages.</p>}
        </Dialog>
      )}
    </>
  );
}
