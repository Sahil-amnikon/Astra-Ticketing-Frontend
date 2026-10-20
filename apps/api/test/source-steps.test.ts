import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractProcedure, readLimitedHtml } from '../src/source-steps';

const html = `<html><body><nav><ol><li>Home</li><li>Products</li></ol></nav><main>
<h1>Outlook connection troubleshooting</h1>
<h2>Check the service status</h2><ol><li>Open the Microsoft 365 service health dashboard.</li><li>Review active incidents for Exchange Online.</li></ol>
<h2>Resolve Outlook connection errors</h2><ol><li>Check the Outlook connection status and record the error.</li><li>Verify network connectivity and Microsoft 365 service health.</li><li>Restart Outlook after confirming the service is healthy.</li></ol>
<footer><ol><li>Contact us</li><li>About us</li></ol></footer></main></body></html>`;

test('extracts a matching ordered list from article main and preserves source attribution', () => {
  const procedure = extractProcedure(
    html,
    'Outlook connection troubleshooting',
    'Outlook connection errors',
    'https://learn.microsoft.com/help',
    'learn.microsoft.com',
  );
  assert.equal(procedure?.heading, 'Resolve Outlook connection errors');
  assert.deepEqual(procedure?.steps, [
    'Check the Outlook connection status and record the error.',
    'Verify network connectivity and Microsoft 365 service health.',
    'Restart Outlook after confirming the service is healthy.',
  ]);
  assert.equal(procedure?.href, 'https://learn.microsoft.com/help');
});

test('captures useful source screenshots from troubleshooting steps without storing them', () => {
  const withImage = `<main>
    <h1>Outlook connection troubleshooting</h1>
    <h2>Fix the connection</h2>
    <ol>
      <li>Open the connection status in Outlook.<img src="/media/outlook-status.png" alt="Outlook connection status" /></li>
      <li>Verify Microsoft 365 service health.</li>
    </ol>
  </main>`;
  const procedure = extractProcedure(
    withImage,
    'Outlook connection troubleshooting',
    'Outlook connection troubleshooting',
    'https://learn.microsoft.com/help/article',
    'learn.microsoft.com',
  );
  assert.equal(procedure?.images.length, 1);
  assert.equal(
    procedure?.images[0]?.src,
    'https://learn.microsoft.com/media/outlook-status.png',
  );
  assert.equal(procedure?.images[0]?.alt, 'Outlook connection status');
});

test('does not invent steps when a page has no procedure', () => {
  assert.equal(
    extractProcedure(
      '<main><h1>Outlook</h1><p>Check this article.</p></main>',
      'Outlook',
      'Outlook error',
      'https://learn.microsoft.com/help',
      'learn.microsoft.com',
    ),
    null,
  );
});

test('broad page title alone cannot make unrelated list into a troubleshooting procedure', () => {
  const unrelated =
    '<main><h1>O365 help</h1><ol><li>Browse products and plans.</li><li>Contact the sales team for options.</li></ol></main>';
  assert.equal(
    extractProcedure(
      unrelated,
      'O365 help',
      'O365',
      'https://learn.microsoft.com/help',
      'learn.microsoft.com',
    ),
    null,
  );
});

test('rejects non-HTML and oversized page responses', async () => {
  assert.equal(
    await readLimitedHtml(
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
    ),
    null,
  );
  assert.equal(
    await readLimitedHtml(
      new Response(html, {
        headers: { 'content-type': 'text/html', 'content-length': '1500001' },
      }),
    ),
    null,
  );
});
