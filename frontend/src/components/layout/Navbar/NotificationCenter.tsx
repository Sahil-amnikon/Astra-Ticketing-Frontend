'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type NotificationItem = {
  id: string;
  ticket_id?: string;
  change_id?: string;
  ticket_number?: string;
  type: string;
  title: string;
  body: string;
  read_at?: string;
  created_at: string;
};

type Preferences = {
  ticketAssigned: boolean;
  ticketTransferred: boolean;
  publicReply: boolean;
  slaAtRisk: boolean;
  slaBreached: boolean;
  ticketUnattended: boolean;
};

const preferenceLabels: Array<[keyof Preferences, string]> = [
  ['ticketAssigned', 'Ticket assigned'],
  ['ticketTransferred', 'Ticket transferred'],
  ['publicReply', 'Public ticket reply'],
  ['slaAtRisk', 'SLA at risk'],
  ['slaBreached', 'SLA breached'],
  ['ticketUnattended', 'Ticket awaiting first response'],
];

export default function NotificationCenter({
  csrfToken,
  ticketBase,
}: {
  csrfToken: string;
  ticketBase: string;
}) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [preferences, setPreferences] = useState<Preferences>();
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/notifications?limit=15', {
      cache: 'no-store',
    });
    if (!response.ok) return;
    const body = (await response.json()) as {
      unread: number;
      items: NotificationItem[];
    };
    setUnread(body.unread);
    setItems(body.items);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  async function request(path: string, body?: unknown) {
    const headers: Record<string, string> = {
      'x-csrf-token': csrfToken,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`/api${path}`, {
      method: 'PATCH',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Notification update failed.');
  }

  function openNotification(item: NotificationItem) {
    setOpen(false);
    if (item.read_at) return;

    setUnread((value) => Math.max(0, value - 1));
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? { ...entry, read_at: new Date().toISOString() }
          : entry,
      ),
    );
    void request(`/notifications/${item.id}/read`).catch(() => {
      // Ticket navigation must not depend on this secondary update. Reloading
      // restores server state when the request was interrupted or rejected.
      void load();
    });
  }

  async function showSettings() {
    setSettings(true);
    setError('');
    if (preferences) return;
    const response = await fetch('/api/notifications/preferences', {
      cache: 'no-store',
    });
    if (!response.ok) {
      setError('Preferences could not be loaded.');
      return;
    }
    setPreferences((await response.json()) as Preferences);
  }

  async function savePreferences() {
    if (!preferences) return;
    setError('');
    try {
      await request('/notifications/preferences', preferences);
      setSettings(false);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  return (
    <div className="notification-center">
      <button
        className="notification-trigger secondary"
        type="button"
        aria-expanded={open}
        aria-label={`${unread} unread notifications`}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">◔</span>
        {unread ? <strong>{unread > 99 ? '99+' : unread}</strong> : null}
      </button>
      {open ? (
        <section className="notification-popover" aria-label="Notifications">
          <div className="notification-heading">
            <div>
              <strong>Notifications</strong>
              <small>{unread} unread</small>
            </div>
            <div>
              <button
                className="link-button"
                onClick={() => void showSettings()}
              >
                Preferences
              </button>
              {unread ? (
                <button
                  className="link-button"
                  onClick={async () => {
                    setError('');
                    try {
                      await request('/notifications/read-all');
                      const readAt = new Date().toISOString();
                      setUnread(0);
                      setItems((current) =>
                        current.map((item) => ({ ...item, read_at: readAt })),
                      );
                      await load();
                    } catch (reason) {
                      setError((reason as Error).message);
                    }
                  }}
                >
                  Mark all read
                </button>
              ) : null}
            </div>
          </div>
          {settings ? (
            <div className="notification-settings">
              <p>Choose which in-app alerts you receive.</p>
              {preferences
                ? preferenceLabels.map(([key, label]) => (
                    <label className="check-label" key={key}>
                      <input
                        type="checkbox"
                        checked={preferences[key]}
                        onChange={(event) =>
                          setPreferences({
                            ...preferences,
                            [key]: event.target.checked,
                          })
                        }
                      />{' '}
                      {label}
                    </label>
                  ))
                : null}
              {error ? <p className="field-error">{error}</p> : null}
              <div className="notification-settings-actions">
                <button
                  className="secondary"
                  onClick={() => setSettings(false)}
                >
                  Cancel
                </button>
                <button
                  className="primary"
                  onClick={() => void savePreferences()}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="notification-list">
              {error ? (
                <p className="notification-error" role="alert">
                  {error}
                </p>
              ) : null}
              {items.map((item) => (
                <Link
                  className={item.read_at ? '' : 'unread'}
                  href={
                    item.change_id
                      ? `/changes/${item.change_id}`
                      : item.ticket_id
                        ? `${ticketBase}/${item.ticket_id}`
                        : '#'
                  }
                  key={item.id}
                  onClick={(event) => {
                    if (!item.ticket_id && !item.change_id)
                      event.preventDefault();
                    openNotification(item);
                  }}
                >
                  <span
                    className={`notification-dot ${item.type.toLowerCase()}`}
                  />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.body}</small>
                    <time>{formatTime(item.created_at)}</time>
                  </span>
                </Link>
              ))}
              {!items.length ? (
                <p className="empty">No notifications yet.</p>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
