const { cpSync } = require('node:fs');
const { resolve } = require('node:path');
const web = resolve(__dirname, '../apps/web');
cpSync(
  resolve(web, '.next/static'),
  resolve(web, '.next/standalone/apps/web/.next/static'),
  { recursive: true },
);
