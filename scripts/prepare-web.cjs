const { cpSync } = require('node:fs');
const { resolve } = require('node:path');
const web = resolve(__dirname, '../frontend');
cpSync(
  resolve(web, '.next/static'),
  resolve(web, '.next/standalone/frontend/.next/static'),
  { recursive: true },
);
cpSync(
  resolve(web, 'public'),
  resolve(web, '.next/standalone/frontend/public'),
  { recursive: true },
);
