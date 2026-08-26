// 2026-08-22 — self-contained copy of the root eslint.config.mjs, scoped to
// this workspace package.
//
// Why a duplicate instead of just relying on the root config: ESLint 9's
// flat config resolves by walking UP from CWD to the nearest
// eslint.config.mjs — with none in frontend/, `eslint src/` (this
// package's own "lint" script) was falling through to the ROOT config,
// which imports `@eslint/js` / `typescript-eslint` / `globals` — all
// declared ONLY in the root package.json's devDependencies, not this
// package's. That's invisible locally (a full `pnpm install` at the repo
// root always installs root's own deps too), but Vercel's "Deployment
// Checks" feature runs its own isolated install scoped to this project's
// Root Directory (frontend/) — root's devDependencies never land in that
// sandbox, so resolving `@eslint/js` from a config file it had to reach
// OUTSIDE frontend/ failed with ERR_MODULE_NOT_FOUND. Giving frontend/ its
// own config + its own copies of these 3 devDependencies (added to
// package.json alongside this file) means `eslint src/` never needs to
// look past this directory, matching how the Vercel Build has always
// scoped itself here.
//
// The root config stays as-is — required by the local pre-commit hook
// (lint-staged runs across the WHOLE repo, including non-frontend files
// like .claude/skills/**, from the repo root) — this file is purely an
// additional, narrower one for frontend/'s own "lint" script.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/.prisma/**',
      '**/generated/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.config.{js,mjs,ts}', '**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
