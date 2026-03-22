# Repository Guidelines

## Project Structure & Module Organization

- Repository root (`./`) is the primary plugin project (Vite + Vue 3 + TypeScript).
- Main entry: `src/index.ts` (loads `index.scss`, exports plugin from `src/plugin/plugin-lifecycle.ts`).
- `src/` contains application code:
  - `core/`: pure domain logic (`*-core.ts`), designed for direct unit testing.
  - `plugin/`: lifecycle wiring, action registry, command/menu registration, action dispatch.
  - `services/`: SiYuan kernel/data access and feature services (export, dedupe, image conversion, link resolving, etc.).
  - `ui/`: Dock/dialog/overlay UI assembly.
  - `types/`, `i18n/`: type declarations and localization resources.
  - `components/`, `utils/`: reserved/minimal directories at present.
- `tests/` contains Vitest suites (`*.test.ts`) and mocks under `tests/mocks/`.
- `assets/` stores static images used by README/docs.
- `docs/` stores internal docs (current structure snapshot: `docs/project-structure.md`).
- `dist/` and `package.zip` are build artifacts.
- `plugin-sample-vite-vue/` is a template/reference project.
- `developer_docs/` stores local SiYuan API/reference materials.

## Build, Test, and Development Commands

Run commands from repository root:

- `pnpm install` installs dependencies.
- `pnpm dev` runs `vite build --watch`.
  - Output target: `<VITE_SIYUAN_WORKSPACE_PATH>/data/plugins/siyuan-doc-assist` (from `.env`).
- `pnpm build` produces `dist/` and `package.zip`.
- `pnpm test` runs Vitest once; `pnpm test:watch` runs in watch mode.
- `pnpm typecheck:strict` runs strict TypeScript checks with `tsconfig.strict.json`.
- `pnpm release`, `pnpm release:patch|minor|major|manual` run `release.js`.
  - Side effects: update `plugin.json` + `package.json`, create commit, push branch, create/push tag (`v*`).

## Configuration & Environment

- Copy `.env.example` to `.env` and set `VITE_SIYUAN_WORKSPACE_PATH`.
- Watch builds deploy to `<workspace>/data/plugins/siyuan-doc-assist`.

## Coding Style & Naming Conventions

- Indentation: 2 spaces, trimmed trailing whitespace, final newline (`.editorconfig`).
- Prefer kebab-case file names (e.g., `link-core.ts`, `export-media-core.ts`).
- Tests use `*.test.ts` and mirror module names (e.g., `link-core.test.ts`).
- ESLint config lives at `eslint.config.mjs` (based on `@antfu/eslint-config`).

## Testing Guidelines

- Framework: Vitest.
- No explicit coverage gate in repo; add or update tests alongside core logic changes.
- Keep tests close to the behavior they validate and favor deterministic inputs.
- Prefer covering `core/` and service adapters when changing behavior in `plugin/action-runner` flows.

## Commit & Pull Request Guidelines

- History shows concise summary commits, including Chinese messages and occasional `type:` prefixes (e.g., `fix:`). Follow the same: short, direct summary; optional `type:` when helpful.
- PRs should include: a clear description, test results (`pnpm test` or reason skipped), and screenshots or GIFs for UI changes.
- If releasing, use `pnpm release:*` so `plugin.json` and `package.json` stay in sync.

## CI/Release Notes

- GitHub Actions workflow: `.github/workflows/release.yml`.
- Trigger: pushing a tag matching `v*`.
- Pipeline: install dependencies -> run tests -> build -> upload `package.zip` to GitHub Release.
