'use client';
import { useEffect, useState } from 'react';
import type { Request } from './record-form';
export default function ContactPortalLink({
  id,
  request,
}: {
  id: string;
  request: Request;
}) {
  const [data, setData] = useState<{
    contact: { user_id?: string; email: string };
    users: { id: string; name: string; email: string }[];
  }>();
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void request(`/portal/access/${id}`)
      .then((r) => {
        if (live) {
          const d = r as NonNullable<typeof data>;
          setData(d);
          setSelected(d.contact.user_id ?? '');
        }
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, [id, request]);
  return (
    <section className="v38-stack panel">
      <h3>Client portal access</h3>
      <p>
        First add an approved Entra account with the Client user role in Users &
        Access and assign this organization. Then link the matching contact
        here. Email-only stakeholders can leave this unset.
      </p>
      <form
        className="v38-stack"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void request(`/portal/access/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ userId: selected || null }),
          })
            .then(() => setMessage('Portal contact link saved.'))
            .catch((e) => setMessage(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          Approved portal account for {data?.contact.email}
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">No portal access</option>
            {data?.users.map((u) => (
              <option value={u.id} key={u.id}>
                {u.name} · {u.email}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" disabled={busy || !data}>
          Save portal link
        </button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
