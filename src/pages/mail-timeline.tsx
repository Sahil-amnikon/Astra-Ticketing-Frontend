'use client';
import { useCallback, useEffect, useState } from 'react';
type Message = {
  id: string;
  direction: string;
  sender_address: string;
  subject: string;
  body: string;
  state: string;
  created_at: string;
  attachments: { id: string; file_name: string }[];
  attachment_warnings?: string[];
};
export default function MailTimeline({
  kind,
  id,
  revision = 0,
}: {
  kind: 'tickets' | 'changes';
  id: string;
  revision?: number;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await fetch(`/api/mail/${kind}/${id}`, {
          cache: 'no-store',
          signal: signal ?? AbortSignal.timeout(15000),
        });
        if (!r.ok) throw new Error('Could not load email conversation.');
        setMessages(await r.json());
        setError('');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id, kind],
  );
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return load(controller.signal);
    });
    return () => controller.abort();
  }, [load, revision]);
  return (
    <section className="panel v38-stack">
      <div className="v38-row">
        <h2>Email conversation</h2>
        <button type="button" className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? (
        <p>Loading emails…</p>
      ) : messages.length === 0 ? (
        <p>
          No email messages recorded for this{' '}
          {kind === 'tickets' ? 'ticket' : 'change'}.
        </p>
      ) : (
        messages.map((m) => (
          <article key={m.id} className="v38-message">
            <div className="v38-row">
              <strong>
                {m.direction === 'INBOUND' ? 'Received from' : 'Sent from'}{' '}
                {m.sender_address}
              </strong>
              <span className="v38-chip">{m.state.replaceAll('_', ' ')}</span>
            </div>
            <small>{new Date(m.created_at).toLocaleString()}</small>
            <h3>{m.subject}</h3>
            <p className="v38-prewrap">{m.body}</p>
            {m.attachment_warnings?.map((warning) => <p key={warning} role="status" className="notice">{warning}</p>)}
            {m.attachments.map((a) => (
              <a
                key={a.id}
                className="secondary mail-attachment"
                href={`/api/mail/attachments/${a.id}`}
              >
                {a.file_name}
              </a>
            ))}
          </article>
        ))
      )}
    </section>
  );
}
