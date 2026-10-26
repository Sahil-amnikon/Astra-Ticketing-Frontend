'use client';

import Link from 'next/link';
import { useMemo, useEffect, useState } from 'react';
import { useWorkspace, WorkspaceFrame } from '../../components/layout/DashboardLayout/WorkspaceFrame';
import type { HelpTopic } from '../../components/ui/HelpChat';

const SECTION_ORDER = [
  'Getting Started',
  'Client Portal',
  'Technician Workspace',
  'Tickets',
  'Knowledge & Troubleshooting',
  'Email',
  'Management',
  'Change Management',
  'Administration',
  'Reports & Audit',
];

type GuideTopic = HelpTopic & {
  keywords: string;
  section?: string;
  notes?: string[];
};

export default function HelpGuide() {
  const w = useWorkspace();
  const [topics, setTopics] = useState<GuideTopic[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const userId = w.session?.user.id;
  const { request, setError } = w;

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void request<GuideTopic[]>('/help/topics')
      .then((items) => {
        if (live) {
          setTopics(items);
          try {
            setSelectedId(decodeURIComponent(window.location.hash.slice(1)));
          } catch {
            setSelectedId('');
          }
        }
      })
      .catch((error) => {
        if (live) setError((error as Error).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [userId, request, setError]);

  useEffect(() => {
    const onHashChange = () => {
      try {
        setSelectedId(decodeURIComponent(window.location.hash.slice(1)));
      } catch {
        setSelectedId('');
      }
      setQuery('');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return topics;
    return topics.filter((topic) =>
      [
        topic.title,
        topic.summary,
        topic.section,
        topic.keywords,
        ...(topic.steps ?? []),
        ...(topic.notes ?? []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [query, topics]);

  const grouped = useMemo(
    () =>
      [
        ...SECTION_ORDER,
        ...new Set(
          matching
            .map((topic) => topic.section ?? 'Getting Started')
            .filter((section) => !SECTION_ORDER.includes(section)),
        ),
      ]
        .map((section) => ({
          section,
          topics: matching.filter(
            (topic) => (topic.section ?? 'Getting Started') === section,
          ),
        }))
        .filter((group) => group.topics.length),
    [matching],
  );

  const selected =
    matching.find((topic) => topic.id === selectedId) ?? matching[0];
  function selectTopic(topic: GuideTopic) {
    setSelectedId(topic.id);
    const url = new URL(window.location.href);
    url.hash = topic.id;
    window.history.replaceState(null, '', url);
  }

  return (
    <WorkspaceFrame
      title="Service Desk user guide"
      description="Complete task-based instructions for the sections and workflows available to your account."
      user={w.session?.user}
      csrfToken={w.session?.csrfToken}
      error={w.error}
    >
      <div className="help-guide-intro panel">
        <p>
          Search by screen, feature or task, then select a topic card to read
          the complete instructions.
        </p>
        <p className="help-guide-kicker">
          Showing {matching.length} of {topics.length} guide topics.
        </p>
        <label htmlFor="guide-search">Search guide</label>
        <input
          id="guide-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ticket, SLA, attachment, email, change, user…"
        />
      </div>

      {loading ? (
        <p role="status">Loading guide…</p>
      ) : grouped.length ? (
        <div className="help-guide-browser">
          <div
            className="help-guide-topic-list"
            role="region"
            aria-label="Guide topic cards"
            tabIndex={0}
          >
            {grouped.map((group) => (
              <section key={group.section} className="help-guide-section">
                <div className="help-guide-section-heading">
                  <h2>{group.section}</h2>
                  <span>{group.topics.length}</span>
                </div>
                <div className="help-guide-card-list">
                  {group.topics.map((topic) => (
                    <button
                      type="button"
                      className="help-guide-topic-card"
                      id={topic.id}
                      key={topic.id}
                      aria-pressed={selected?.id === topic.id}
                      aria-controls="guide-topic-detail"
                      onClick={() => selectTopic(topic)}
                    >
                      <span>
                        <strong>{topic.title}</strong>
                        <small>
                          {selected?.id === topic.id
                            ? 'Reading now'
                            : 'View instructions'}
                        </small>
                      </span>
                      <span
                        className="help-guide-card-chevron"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {selected ? (
            <article
              className="panel help-guide-detail"
              id="guide-topic-detail"
              aria-labelledby="guide-detail-title"
            >
              <span className="help-guide-detail-section">
                {selected.section ?? 'Getting Started'}
              </span>
              <h2 id="guide-detail-title" aria-live="polite">
                {selected.title}
              </h2>
              <p className="help-guide-detail-summary">{selected.summary}</p>
              <h3>Steps</h3>
              <ol>
                {selected.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
              {selected.notes?.length ? (
                <>
                  <h3>Important notes</h3>
                  <ul>
                    {selected.notes.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              <div className="help-guide-detail-footer">
                <p>
                  Read the steps and important notes before changing a record.
                </p>
                <Link href={selected.href}>Open this section →</Link>
              </div>
            </article>
          ) : null}
        </div>
      ) : (
        <div className="panel">
          <h2>No matching guide topic</h2>
          <p>
            Try a shorter search phrase such as <strong>ticket</strong>,{' '}
            <strong>SLA</strong>, <strong>attachment</strong>,{' '}
            <strong>email</strong>, or <strong>change</strong>.
          </p>
          <button type="button" onClick={() => setQuery('')}>
            Clear search
          </button>
        </div>
      )}
    </WorkspaceFrame>
  );
}
