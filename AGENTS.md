# Repository Guidelines

## Project Structure & Module Organization

- `siyuan-doc-assistant/` is the primary plugin project (Vite + Vue 3 + TypeScript).
- `siyuan-doc-assistant/src/` contains application code:
  - `core/` holds core domain logic (files named `*-core.ts`).
  - `components/`, `ui/`, `services/`, `utils/`, `types/`, `i18n/` are feature areas.
- `siyuan-doc-assistant/tests/` contains unit tests (`*.test.ts`) aligned to core modules.
- `siyuan-doc-assistant/asset/` stores static assets.
- `siyuan-doc-assistant/dist/` and `siyuan-doc-assistant/package.zip` are build outputs.
- `plugin-sample-vite-vue/` is a reference template; `reference_docs/` holds SiYuan docs; `memo.md` is project notes.

## Build, Test, and Development Commands

Run commands from `siyuan-doc-assistant/`:

- `pnpm install` installs dependencies.
- `pnpm dev` runs Vite in watch mode and outputs to the local SiYuan workspace plugin directory.
- `pnpm build` produces `dist/` and `package.zip`.
- `pnpm test` runs Vitest once; `pnpm test:watch` runs in watch mode.
- `pnpm release:*` runs `release.js` to bump versions, tag, and push (use with care).

## Configuration & Environment

- Copy `.env.example` to `.env` and set `VITE_SIYUAN_WORKSPACE_PATH`.
- Watch builds deploy to `<workspace>/data/plugins/<plugin.json.name>`.

## Coding Style & Naming Conventions

- Indentation: 2 spaces, trimmed trailing whitespace, final newline (`siyuan-doc-assistant/.editorconfig`).
- Prefer kebab-case file names (e.g., `link-core.ts`, `export-media-core.ts`).
- Tests use `*.test.ts` and mirror module names (e.g., `link-core.test.ts`).
- ESLint config lives at `siyuan-doc-assistant/eslint.config.mjs` (based on `@antfu/eslint-config`).

## Testing Guidelines

- Framework: Vitest.
- No explicit coverage gate in repo; add or update tests alongside core logic changes.
- Keep tests close to the behavior they validate and favor deterministic inputs.

## Commit & Pull Request Guidelines

- History shows concise summary commits, including Chinese messages and occasional `type:` prefixes (e.g., `fix:`). Follow the same: short, direct summary; optional `type:` when helpful.
- PRs should include: a clear description, test results (`pnpm test` or reason skipped), and screenshots or GIFs for UI changes.
- If releasing, use `pnpm release:*` so `plugin.json` and `package.json` stay in sync.
