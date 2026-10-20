import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { HelpService, searchTerms } from '../src/help';
import { visibleHelpTopics } from '../src/help-topics';
import type { AuthenticatedUser } from '../src/auth';

const client = {
  id: 'user',
  roles: ['USER'],
  clientIds: ['client'],
  siteIds: [],
} as unknown as AuthenticatedUser;

const tech = {
  id: 'tech',
  roles: ['TECHNICIAN'],
  permissions: ['TICKETS_TEAM_VIEW'],
  clientIds: ['client'],
  siteIds: ['site'],
} as unknown as AuthenticatedUser;

const admin = {
  id: 'admin',
  roles: ['ADMIN'],
  clientIds: [],
  siteIds: [],
} as unknown as AuthenticatedUser;

function harness() {
  const calls: {
    service: string;
    user: AuthenticatedUser;
    query: Record<string, unknown>;
  }[] = [];

  const search = {
    search: async (user: AuthenticatedUser, question: string) => {
      calls.push({
        service: 'search',
        user,
        query: { question },
      });

      const base = {
        answer: 'Search results returned within the authenticated access scope.',
        topics: [],
        knowledge: [],
        tickets: [],
        results: [],
        query: question,
        normalizedQuery: question.toLowerCase(),
        detectedProducts: [],
        detectedSymptoms: [],
        suggestions: [],
      };

      if (question === 'Show my recent tickets') {
        return {
          ...base,
          tickets: [
            {
              sourceType: 'ticket',
              id: 'ticket-2',
              title: 'INC-000002 · VPN',
              summary: 'OPEN',
              score: 10,
              matchReasons: ['ticket search'],
              href: '/client?ticket=ticket-2',
            },
          ],
          results: [
            {
              sourceType: 'ticket',
              id: 'ticket-2',
              title: 'INC-000002 · VPN',
              summary: 'OPEN',
              score: 10,
              matchReasons: ['ticket search'],
              href: '/client?ticket=ticket-2',
            },
          ],
        };
      }

      if (question === 'Troubleshoot VPN issue') {
        return {
          ...base,
          detectedProducts: ['VPN'],
          detectedSymptoms: ['issue'],
          tickets: [
            {
              sourceType: 'ticket',
              id: 'ticket-1',
              title: 'INC-000001 · VPN',
              summary: 'VPN',
              score: 12,
              matchReasons: ['resolved ticket'],
              href: '/operations/tickets/ticket-1',
              resolution: 'Check the VPN connection.',
            },
          ],
          results: [
            {
              sourceType: 'ticket',
              id: 'ticket-1',
              title: 'INC-000001 · VPN',
              summary: 'VPN',
              score: 12,
              matchReasons: ['resolved ticket'],
              href: '/operations/tickets/ticket-1',
              resolution: 'Check the VPN connection.',
            },
          ],
        };
      }

      if (question === 'Find articles about VPN') {
        return {
          ...base,
          detectedProducts: ['VPN'],
          knowledge: [
            {
              sourceType: 'knowledge',
              id: 'article-1',
              title: 'VPN guide',
              summary: 'Check connection.',
              score: 11,
              matchReasons: ['knowledge article'],
              href: '/knowledge?article=article-1',
            },
          ],
          results: [
            {
              sourceType: 'knowledge',
              id: 'article-1',
              title: 'VPN guide',
              summary: 'Check connection.',
              score: 11,
              matchReasons: ['knowledge article'],
              href: '/knowledge?article=article-1',
            },
          ],
        };
      }

      if (question === 'Find client Example') {
        return {
          ...base,
          results: [
            {
              sourceType: 'record',
              id: 'client-1',
              title: 'Example Client',
              summary: 'Client record',
              score: 9,
              matchReasons: ['directory'],
              href: '/admin/clients?q=Example',
            },
          ],
          suggestions: ['Review the matching client record.'],
        };
      }

      if (question === 'Show all tickets') {
        return {
          ...base,
          tickets: [
            {
              sourceType: 'ticket',
              id: 'ticket-1',
              title: 'INC-000001 · VPN',
              summary: 'OPEN',
              score: 10,
              matchReasons: ['ticket search'],
              href: '/admin/ticket/ticket-1',
            },
          ],
        };
      }

      return base;
    },
  };

  const tickets = { list: async () => ({ items: [] }) };
  const portal = { list: async () => ({ items: [] }) };
  const knowledge = { list: async () => ({ items: [] }) };
  const directory = { list: async () => ({ items: [] }) };

  return {
    service: new HelpService(
      tickets as never,
      portal as never,
      knowledge as never,
      directory as never,
      search as never,
    ),
    calls,
  };
}

test('client help search preserves user scope and returns only public ticket result data', async () => {
  const { service, calls } = harness();
  const result = await service.ask(client, 'Show my recent tickets');

  assert.deepEqual(
    calls.map((call) => call.service),
    ['search'],
  );
  assert.equal(calls[0]?.user, client);
  assert.equal(calls[0]?.query.question, 'Show my recent tickets');
  assert.equal(result.tickets[0]?.href, '/client?ticket=ticket-2');
  assert.equal(result.tickets.length, 1);
  assert.ok(!JSON.stringify(result).includes('Example Client'));
});

test('technician help search preserves technician access and returns troubleshooting results', async () => {
  const { service, calls } = harness();
  const result = await service.ask(tech, 'Troubleshoot VPN issue');

  assert.deepEqual(
    calls.map((call) => call.service),
    ['search'],
  );
  assert.equal(calls[0]?.user, tech);
  assert.equal(calls[0]?.query.question, 'Troubleshoot VPN issue');
  assert.equal(result.tickets[0]?.href, '/operations/tickets/ticket-1');
  assert.equal(result.tickets[0]?.resolution, 'Check the VPN connection.');
  assert.ok(
    !visibleHelpTopics(tech).some((topic) => topic.audience === 'admin'),
  );
});

test('client troubleshooting returns knowledge results without exposing staff-only ticket details', async () => {
  const { service, calls } = harness();
  const result = await service.ask(client, 'Find articles about VPN');

  assert.deepEqual(
    calls.map((call) => call.service),
    ['search'],
  );
  assert.equal(calls[0]?.user, client);
  assert.equal(result.knowledge[0]?.href, '/knowledge?article=article-1');
  assert.equal(result.tickets.length, 0);
});

test('administrator help search preserves administrator scope', async () => {
  const { service, calls } = harness();
  const result = await service.ask(admin, 'Find client Example');

  assert.deepEqual(
    calls.map((call) => call.service),
    ['search'],
  );
  assert.equal(calls[0]?.user, admin);
  assert.equal(result.results[0]?.title, 'Example Client');

  await service.ask(admin, 'Show all tickets');
  assert.equal(calls.at(-1)?.query.question, 'Show all tickets');
});

test('guide topics and queries respect role restrictions', async () => {
  const { service, calls } = harness();

  assert.ok(
    !service.topics(client).some((topic) => topic.id === 'reply-notes'),
  );
  assert.equal(
    visibleHelpTopics(client).some((topic) => topic.audience === 'admin'),
    false,
  );
  assert.equal(
    visibleHelpTopics(admin).some((topic) => topic.audience === 'admin'),
    true,
  );
  assert.equal(searchTerms('Where is INC-000001?'), 'INC-000001');

  await assert.rejects(
    service.ask({ ...client, roles: [] }, 'VPN'),
    ForbiddenException,
  );
  assert.equal(calls.length, 0);
});
