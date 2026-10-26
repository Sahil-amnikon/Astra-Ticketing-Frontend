import js from '@eslint/js';
import ts from 'typescript-eslint';
import next from 'eslint-config-next/core-web-vitals';
const config = [
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/next-env.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...next,
  { settings: { next: { rootDir: 'frontend/' } } },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        require: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        exports: 'readonly',
        module: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];

export default config;
