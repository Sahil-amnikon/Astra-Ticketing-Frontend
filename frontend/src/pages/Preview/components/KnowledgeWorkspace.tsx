'use client';
import { useState } from 'react';
import Dialog from '../../../components/ui/Dialog';
import UiIcon from '../../../components/ui/UiIcon';
import { Status } from './TicketQueue';

const articles = [
  {
    category: 'Getting started',
    title: 'Your first day with ASTRA',
    description: 'Find your workspace, create a request, and stay up to date.',
    icon: 'grid' as const,
    body: [
      'Choose the workspace your administrator has assigned to you.',
      'Create a ticket with a clear subject and the affected client or service.',
      'Follow the ticket timeline for progress and replies.',
    ],
  },
  {
    category: 'Network & connectivity',
    title: 'Connect to your company VPN',
    description:
      'A quick guide to secure remote access and common connection issues.',
    icon: 'sites' as const,
    body: [
      'Confirm that your internet connection is available.',
      'Open your approved VPN client and sign in using your organisation account.',
      'If the connection fails, record the exact error and submit a support request.',
    ],
  },
  {
    category: 'Microsoft 365',
    title: 'Troubleshoot Outlook and shared mailboxes',
    description:
      'Resolve common sign-in, permissions, and mailbox sync problems.',
    icon: 'contacts' as const,
    body: [
      'Check the Microsoft 365 service status with your administrator.',
      'Confirm that the shared mailbox permissions are assigned to your account.',
      'Restart Outlook. If the problem continues, include the error and time in your request.',
    ],
  },
  {
    category: 'Security',
    title: 'Keep your account secure',
    description: 'Simple steps for passwords, MFA, and suspicious messages.',
    icon: 'check' as const,
    body: [
      'Use the approved multifactor authentication method for your account.',
      'Never share passwords or approve an unexpected sign-in prompt.',
      'Report suspicious email to your service desk and follow your organisation’s security policy.',
    ],
  },
  {
    category: 'Devices',
    title: 'Before you raise a hardware ticket',
    description:
      'The useful details that help us resolve device issues faster.',
    icon: 'assets' as const,
    body: [
      'Include the asset label and device type in the request.',
      'Describe the symptoms and when they started.',
      'Attach a screenshot of the error if it does not contain sensitive information.',
    ],
  },
  {
    category: 'Service desk',
    title: 'Understand ticket status and priorities',
    description: 'Know what happens after you submit a request.',
    icon: 'tickets' as const,
    body: [
      'New and open requests are waiting for the team to begin work.',
      'In progress means a technician is investigating. Waiting for client means your reply is needed.',
      'When the issue is resolved, confirm the outcome with your technician.',
    ],
  },
];
export default function KnowledgeWorkspace({
  catalogue = false,
  onRequest,
}: {
  catalogue?: boolean;
  onRequest: (subject: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All articles');
  const [selected, setSelected] = useState<(typeof articles)[number] | null>(
    null,
  );
  const services = [
    {
      category: 'Identity & access',
      title: 'New starter onboarding',
      description:
        'Get a new colleague ready with the accounts and access they need.',
      icon: 'users' as const,
    },
    {
      category: 'Devices',
      title: 'Device or equipment support',
      description:
        'Request help with a laptop, desktop, printer, or peripheral.',
      icon: 'assets' as const,
    },
    {
      category: 'Microsoft 365',
      title: 'Application access',
      description:
        'Request access to an approved business application or shared mailbox.',
      icon: 'grid' as const,
    },
    {
      category: 'Network',
      title: 'Network & VPN access',
      description: 'Get connected securely, in the office or working remotely.',
      icon: 'sites' as const,
    },
  ];
  const filtered = (catalogue ? services : articles).filter(
    (a) =>
      `${a.title} ${a.category}`.toLowerCase().includes(query.toLowerCase()) &&
      (category === 'All articles' || category === a.category),
  );
  return (
    <>
      <div className="spark-knowledge-search">
        <UiIcon name="search" />
        <input
          aria-label="Search knowledge"
          placeholder={
            catalogue
              ? 'What service do you need?'
              : 'Search articles, how-to guides, and answers...'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!catalogue && (
        <div className="spark-tabs spark-knowledge-tabs">
          {[
            'All articles',
            'Getting started',
            'Microsoft 365',
            'Security',
            'Devices',
          ].map((c) => (
            <button
              key={c}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="spark-knowledge-grid">
        {filtered.map((article) => (
          <article key={article.title} className="panel spark-knowledge-card">
            <span className="spark-feature-icon">
              <UiIcon name={article.icon} />
            </span>
            <span className="eyebrow">{article.category}</span>
            <h2>{article.title}</h2>
            <p>{article.description}</p>
            <footer>
              {catalogue ? (
                <Status value="Available" />
              ) : (
                <span>3 min read · Published</span>
              )}
              <button
                className="text-button"
                onClick={() =>
                  catalogue
                    ? onRequest(article.title)
                    : setSelected(article as (typeof articles)[number])
                }
              >
                {catalogue ? 'Request service' : 'Read article'} →
              </button>
            </footer>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="spark-empty">
          <h3>No matching {catalogue ? 'services' : 'articles'}</h3>
          <p>Try a different keyword or category.</p>
        </div>
      )}
      {selected && (
        <Dialog title={selected.title} onClose={() => setSelected(null)} wide>
          <span className="eyebrow">{selected.category} · Sample article</span>
          <p>{selected.description}</p>
          <ol className="spark-article-steps">
            {selected.body.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="spark-helpful">
            <span>Need more help?</span>
            <button
              className="primary"
              onClick={() => {
                onRequest(selected.title);
                setSelected(null);
              }}
            >
              Create a support request
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
