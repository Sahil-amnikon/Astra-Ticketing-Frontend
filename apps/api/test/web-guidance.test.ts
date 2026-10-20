import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { approvedSource, WebGuidanceService } from '../src/web-guidance';

Object.assign(process.env, {
  DATABASE_URL: 'postgresql://test:secret@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  APP_BASE_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
});

const tech = { id: 'tech', roles: ['TECHNICIAN'] } as never;
const client = { id: 'client', roles: ['USER'] } as never;

test('search source URLs require safe HTTPS hosts', () => {
  assert.equal(
    approvedSource('https://learn.microsoft.com/en-us/help'),
    'https://learn.microsoft.com/en-us/help',
  );
  assert.equal(
    approvedSource('https://support.microsoft.com/help'),
    'https://support.microsoft.com/help',
  );
  for (const url of [
    'https://user:pass@example.com/help',
    'http://example.com/help',
    'https://localhost/help',
    'https://127.0.0.1/help',
    'javascript:alert(1)',
  ])
    assert.equal(approvedSource(url), null);
});

test('disabled web guidance and client role never call provider', async () => {
  const prior = process.env.WEB_GUIDANCE_ENABLED;
  process.env.WEB_GUIDANCE_ENABLED = 'false';
  const service = new WebGuidanceService({} as never);
  try {
    await assert.rejects(
      service.search(client, {
        query: 'Outlook cannot connect',
      }),
      ForbiddenException,
    );
    await assert.rejects(
      service.search(tech, {
        query: 'Outlook cannot connect',
      }),
      ServiceUnavailableException,
    );
  } finally {
    if (prior === undefined) delete process.env.WEB_GUIDANCE_ENABLED;
    else process.env.WEB_GUIDANCE_ENABLED = prior;
  }
});

test('technician initiated query sends the prompt to the provider and filters results', async () => {
  const prior = {
    flag: process.env.WEB_GUIDANCE_ENABLED,
    key: process.env.BRAVE_SEARCH_API_KEY,
    provider: process.env.WEB_GUIDANCE_PROVIDER,
  };
  const originalFetch = globalThis.fetch;
  process.env.WEB_GUIDANCE_ENABLED = 'true';
  process.env.WEB_GUIDANCE_PROVIDER = 'brave';
  process.env.BRAVE_SEARCH_API_KEY = 'test-key-not-for-production-123456';
  let requested = '';
  let pageRequested = '';
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://learn.microsoft.com/')) {
      pageRequested = String(url);
      assert.equal(
        (init?.headers as Record<string, string>)['X-Subscription-Token'],
        undefined,
      );
      return new Response(
        '<main><h1>Outlook connection issue</h1><h2>Resolve Outlook connection errors</h2><ol><li>Check the Outlook connection status.</li><li>Verify Microsoft 365 service health.</li><li>Restart Outlook after the service is healthy.</li></ol></main>',
        { headers: { 'content-type': 'text/html' } },
      );
    }
    if (new URL(String(url)).hostname !== 'api.search.brave.com') {
      assert.equal(
        (init?.headers as Record<string, string>)['X-Subscription-Token'],
        undefined,
      );
      return new Response('', { status: 404 });
    }
    requested = String(url);
    assert.equal(
      (init?.headers as Record<string, string>)['X-Subscription-Token'],
      process.env.BRAVE_SEARCH_API_KEY,
    );
    return new Response(
      JSON.stringify({
        web: {
          results: [
            {
              title: 'Microsoft guide',
              url: 'https://learn.microsoft.com/en-us/troubleshoot',
              description: '<b>Check</b> service health',
              extra_snippets: ['Review logs'],
            },
            {
              title: 'Spoofed guide',
              url: 'https://learn.microsoft.com.evil.example/path',
              description: 'Ignore this',
            },
          ],
        },
      }),
      { status: 200 },
    );
  };
  let usage = 0;
  const deps = { redis: { incr: async () => ++usage, expire: async () => 1 } };
  try {
    const service = new WebGuidanceService(deps as never);
    const result = await service.search(tech, {
      query: 'Outlook cannot connect',
    });
    assert.equal(new URL(requested).hostname, 'api.search.brave.com');
    assert.equal(
      new URL(requested).searchParams.get('q'),
      'Outlook cannot connect',
    );
    assert.equal(result.results.length, 2);
    assert.equal(
      pageRequested,
      'https://learn.microsoft.com/en-us/troubleshoot',
    );
    assert.equal(
      result.procedures[0]?.heading,
      'Resolve Outlook connection errors',
    );
    assert.equal(result.procedures[0]?.steps.length, 3);
    assert.deepEqual(result.results[0]?.excerpts, [
      'Check service health',
      'Review logs',
    ]);
    await assert.rejects(
      service.search(tech, { query: 'INC-000001' }),
      BadRequestException,
    );
    await assert.rejects(
      service.search(tech, { query: 'VPN 172.16.3.5' }),
      BadRequestException,
    );
    assert.equal(usage, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (prior.flag === undefined) delete process.env.WEB_GUIDANCE_ENABLED;
    else process.env.WEB_GUIDANCE_ENABLED = prior.flag;
    if (prior.key === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = prior.key;
    if (prior.provider === undefined) delete process.env.WEB_GUIDANCE_PROVIDER;
    else process.env.WEB_GUIDANCE_PROVIDER = prior.provider;
  }
});

test('private SearXNG returns general web sources and extracted procedures without a key', async () => {
  const prior = {
    flag: process.env.WEB_GUIDANCE_ENABLED,
    key: process.env.BRAVE_SEARCH_API_KEY,
    provider: process.env.WEB_GUIDANCE_PROVIDER,
  };
  const originalFetch = globalThis.fetch;
  process.env.WEB_GUIDANCE_ENABLED = 'true';
  process.env.WEB_GUIDANCE_PROVIDER = 'searxng';
  delete process.env.BRAVE_SEARCH_API_KEY;
  let searchUrl = '';
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://learn.microsoft.com/'))
      return new Response(
        '<main><h1>Outlook issue</h1><h2>Fix connection</h2><ol><li>Check the connection status.</li><li>Verify service health.</li></ol></main>',
        { headers: { 'content-type': 'text/html' } },
      );
    if (new URL(String(url)).hostname !== 'searxng')
      return new Response('', { status: 404 });
    searchUrl = String(url);
    return new Response(
      JSON.stringify({
        results: [
          {
            title: 'Microsoft guide',
            url: 'https://learn.microsoft.com/en-us/troubleshoot',
            content: 'Connection troubleshooting',
          },
          {
            title: 'General vendor guide',
            url: 'https://support.example.com/troubleshoot',
            content: 'Troubleshooting steps from a general web source',
          },
          {
            title: 'Untrusted',
            url: 'http://127.0.0.1/troubleshoot',
            content: 'Ignore this',
          },
        ],
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  };
  const deps = { redis: { incr: async () => 1, expire: async () => 1 } };
  try {
    const service = new WebGuidanceService(deps as never);
    assert.equal(service.status(tech).enabled, true);
    assert.equal(service.status(tech).provider, 'searxng');
    const result = await service.search(tech, {
      query: 'Outlook cannot connect',
    });
    assert.equal(new URL(searchUrl).hostname, 'searxng');
    assert.equal(new URL(searchUrl).searchParams.get('format'), 'json');
    assert.equal(result.results.length, 2);
    assert.equal(result.procedures[0]?.heading, 'Fix connection');
  } finally {
    globalThis.fetch = originalFetch;
    if (prior.flag === undefined) delete process.env.WEB_GUIDANCE_ENABLED;
    else process.env.WEB_GUIDANCE_ENABLED = prior.flag;
    if (prior.key === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = prior.key;
    if (prior.provider === undefined) delete process.env.WEB_GUIDANCE_PROVIDER;
    else process.env.WEB_GUIDANCE_PROVIDER = prior.provider;
  }
});

test('daily per-actor limit blocks provider access after 20 searches', async () => {
  const original = {
    enabled: process.env.WEB_GUIDANCE_ENABLED,
    key: process.env.BRAVE_SEARCH_API_KEY,
    provider: process.env.WEB_GUIDANCE_PROVIDER,
  };
  process.env.WEB_GUIDANCE_ENABLED = 'true';
  process.env.WEB_GUIDANCE_PROVIDER = 'brave';
  process.env.BRAVE_SEARCH_API_KEY = 'test-key-not-for-production-123456';
  const service = new WebGuidanceService({
    redis: { incr: async () => 21 },
  } as never);
  try {
    await assert.rejects(
      service.search(tech, {
        query: 'Docker daemon failure',
      }),
      (error: unknown) => (error as { status?: number }).status === 429,
    );
  } finally {
    if (original.enabled === undefined) delete process.env.WEB_GUIDANCE_ENABLED;
    else process.env.WEB_GUIDANCE_ENABLED = original.enabled;
    if (original.key === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = original.key;
    if (original.provider === undefined)
      delete process.env.WEB_GUIDANCE_PROVIDER;
    else process.env.WEB_GUIDANCE_PROVIDER = original.provider;
  }
});
