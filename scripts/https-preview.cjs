const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, '.local', 'tls');
const key = process.env.ASTRA_TLS_KEY || path.join(directory, 'preview.key');
const cert = process.env.ASTRA_TLS_CERT || path.join(directory, 'preview.crt');
const port = Number(process.env.ASTRA_HTTPS_PORT || 3443);
const upstreamPort = Number(process.env.ASTRA_UI_PORT || 3100);

if (!fs.existsSync(key) || !fs.existsSync(cert)) {
  if (process.env.ASTRA_TLS_KEY || process.env.ASTRA_TLS_CERT) {
    throw new Error('The configured TLS certificate and private key must both exist.');
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '30',
    '-keyout', key, '-out', cert, '-subj', '/CN=ASTRA UI Preview',
    '-addext', 'subjectAltName=IP:172.31.3.13,IP:127.0.0.1,DNS:localhost',
  ], { stdio: 'ignore' });
  fs.chmodSync(key, 0o600);
}

const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (request, response) => {
  const upstream = http.request({
    hostname: '127.0.0.1', port: upstreamPort, path: request.url,
    method: request.method,
    headers: { ...request.headers, 'x-forwarded-proto': 'https', 'x-forwarded-host': request.headers.host || '' },
  }, incoming => {
    response.writeHead(incoming.statusCode || 502, incoming.headers);
    incoming.pipe(response);
  });
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
    response.end('The ASTRA preview is unavailable. Start npm run preview first.');
  });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
});
server.listen(port, '0.0.0.0', () => {
  console.log(`ASTRA HTTPS preview: https://172.31.3.13:${port}/ui-preview`);
  console.log('Uses a local development certificate unless ASTRA_TLS_CERT and ASTRA_TLS_KEY are configured.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
