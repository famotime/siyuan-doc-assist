# Repository Guidelines

## Project Overview

- This repository is the main `siyuan-doc-assist` plugin project for SiYuan Notes.
- Stack: TypeScript, Vite 6, Vitest, SCSS.
- Runtime shape: SiYuan plugin lifecycle + service adapters + mostly vanilla DOM UI wiring.
- Main entry: `src/index.ts`, which loads `src/index.scss` and re-exports the plugin from `src/plugin/plugin-lifecycle.ts`.

## Project Structure

- `src/`: application source.
- `src/core/`: pure domain logic in `*-core.ts` files, intended for focused unit tests.
- `src/plugin/`: plugin lifecycle, command/menu registration, action dispatch, controller wiring.
- `src/services/`: SiYuan kernel/file access adapters and higher-level feature services.
- `src/ui/`: dock, dialog, overlay, and DOM rendering helpers.
- `src/types/`: local type declarations and SiYuan type augmentation.
- `src/i18n/`: localization JSON resources.
- `tests/`: Vitest suites and `tests/mocks/`.
- `assets/`: README/doc images.
- `docs/`: internal docs such as `docs/project-structure.md`, `docs/refactor-plan.md`, and `docs/changelog.md`.
- `developer_docs/`: local SiYuan API and reference materials.
- `plugin-sample-vite-vue/`: template/reference project, not part of the main plugin runtime.
- `dist/` and `package.zip`: build artifacts.
- `tmp/`: temporary local files, not release content.

## Architecture Notes

- `src/plugin/plugin-lifecycle.ts` is the composition root and main SiYuan plugin class.
- `src/plugin/actions.ts` defines user-facing actions and grouping metadata.
- `src/plugin/action-runner.ts` is the main execution shell; specialized handlers are split into:
  - `src/plugin/action-runner-export-handlers.ts`
  - `src/plugin/action-runner-organize-handlers.ts`
  - `src/plugin/action-runner-insert-handlers.ts`
  - `src/plugin/action-runner-media-handlers.ts`
  - `src/plugin/action-runner-block-transform.ts`
- Key-info sidebar flow is centered on:
  - `src/plugin/key-info-controller.ts`
  - `src/services/key-info.ts`
  - `src/ui/key-info-dock.ts`
- Kernel access is funneled through `src/services/kernel.ts` and related `kernel-*` modules.
- Prefer keeping logic boundaries sharp:
  - pure transforms in `core/`
  - SiYuan/IO integration in `services/`
  - lifecycle and orchestration in `plugin/`
  - DOM rendering/state projection in `ui/`

## Build, Test, and Dev Commands

Run from repository root:

- `pnpm install`: install dependencies.
- `pnpm dev`: run `vite build --watch`.
- `pnpm build`: produce `dist/` and `package.zip`.
- `pnpm test`: run all Vitest tests once.
- `pnpm test:watch`: run Vitest in watch mode.
- `pnpm typecheck:strict`: run strict TypeScript checks with `tsconfig.strict.json`.
- `pnpm vitest run tests/<name>.test.ts`: run a single test file.
- `pnpm release`
- `pnpm release:patch`
- `pnpm release:minor`
- `pnpm release:major`
- `pnpm release:manual`

Release scripts update both `plugin.json` and `package.json`, then create a commit, push, and create/push a `v*` tag.

## Environment

- Copy `.env.example` to `.env`.
- Set `VITE_SIYUAN_WORKSPACE_PATH` to the local SiYuan workspace path.
- Watch builds deploy to `<workspace>/data/plugins/siyuan-doc-assist`.

## Coding Conventions

- Use 2-space indentation, no trailing whitespace, and keep a final newline.
- Prefer kebab-case file names.
- Keep pure logic in `core/` when possible so it stays easy to test.
- Prefer extending existing modules over introducing parallel abstractions unless the current file is clearly overloaded.
- Follow existing naming patterns such as `*-core.ts`, `kernel-*.ts`, and `action-runner-*.ts`.
- Use `eslint.config.mjs` as the style baseline.
- Keep comments short and only where the code would otherwise be non-obvious.

## Testing Expectations

- Framework: Vitest.
- Add or update tests when behavior changes, especially for:
  - `src/core/`
  - service adapters
  - action-runner flows
  - key-info extraction and dock state behavior
- Favor deterministic tests with local mocks over broad integration-style setup.
- Mirror module names in test files where practical.

## Release and CI

- CI workflow: `.github/workflows/release.yml`.
- Release is triggered by pushing a tag matching `v*`.
- Expected pipeline: install dependencies, run tests, build, upload `package.zip` to GitHub Release.

## Commit and PR Guidelines

- Follow the existing history style: short, direct commit summaries; optional prefixes like `fix:` or `feat:` are fine.
- If UI changes are involved, include screenshots or GIFs in the PR.
- Report test results in the PR description, or explain why tests were skipped.
- Use `pnpm release:*` for version bumps so `plugin.json` and `package.json` remain in sync.

## Agent Working Notes

- Do not edit build artifacts in `dist/` or `package.zip` manually unless the task is specifically about release outputs.
- Treat `plugin-sample-vite-vue/` and `developer_docs/` as reference material unless the task explicitly targets them.
- Be careful with document-mutating features: many plugin actions change SiYuan content or document paths and may not be undoable through normal editor undo.
- When structural changes are made, keep `docs/project-structure.md` and related docs aligned if they are affected by the task.
