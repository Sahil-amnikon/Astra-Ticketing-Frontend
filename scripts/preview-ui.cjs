const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { existsSync } = require('node:fs');
const port = process.env.ASTRA_UI_PORT || '3100';
const root = resolve(__dirname, '..');
const server = resolve(root, 'frontend/.next/standalone/frontend/server.js');
const development = process.argv.includes('--dev');
if (!development && !existsSync(server)) {
  console.error('Build the frontend first: npm run build:web');
  process.exit(1);
}
const child = spawn(
  process.execPath,
  development
    ? [
        require.resolve('next/dist/bin/next'),
        'dev',
        '--webpack',
        '-H',
        '0.0.0.0',
        '-p',
        port,
      ]
    : [server],
  {
    cwd: development ? resolve(root, 'frontend') : root,
    env: {
      ...process.env,
      ASTRA_UI_PREVIEW: '1',
      HOSTNAME: '0.0.0.0',
      PORT: port,
    },
    stdio: 'inherit',
  },
);
child.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
