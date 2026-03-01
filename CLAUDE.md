# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A SiYuan Notes plugin (v1.2.8, minAppVersion 3.5.7) that adds document extraction, organization, and editing tools. Built with TypeScript + Vite 6, compiled to CommonJS format as required by SiYuan's plugin system.

## Commands

```bash
pnpm install                  # Install dependencies
pnpm dev                      # Vite watch mode → deploys to local SiYuan workspace
pnpm build                    # Produce dist/ and package.zip
pnpm test                     # Run Vitest once
pnpm test:watch               # Run Vitest in watch mode
pnpm typecheck:strict         # TypeScript strict type check
pnpm release:patch/minor/major  # Bump version in plugin.json + package.json, tag, push
```

**Environment setup:** Copy `.env.example` to `.env` and set `VITE_SIYUAN_WORKSPACE_PATH` to your SiYuan data directory. Dev builds auto-deploy to `<workspace>/data/plugins/siyuan-doc-assist`.

**Run a single test file:**
```bash
pnpm vitest run tests/key-info-core.test.ts
```

## Architecture

### Layer Structure

```
plugin-lifecycle.ts (extends SiYuan Plugin)
  ├── ActionRunner          → executes all 14 document actions
  ├── KeyInfoController     → manages key-info sidebar panel
  └── Plugin Event Bindings → SiYuan editor events
        ↓
core/          Pure domain logic (*-core.ts files)
services/      Kernel API facade + DB queries (SQL via /api/query/sql)
ui/            Vanilla DOM panel and dialog components
```

### Entry Point

`src/index.ts` → imports global styles, exports `DocLinkToolkitPlugin` (the main plugin class) from `src/plugin/plugin-lifecycle.ts`.

### Action System

All user-facing operations are defined in `src/plugin/actions.ts` (14 actions in 4 groups: export, organize, insert, edit). `ActionRunner` in `src/plugin/action-runner.ts` implements all handlers. Actions are available via:
- SiYuan command palette (always registered)
- Editor title right-click menu (user-configurable, order draggable, persisted via `plugin.saveData()`)

### Key-Info Extraction

`src/services/key-info.ts` orchestrates extraction; `src/core/key-info-core.ts` implements the parsing algorithm. Strategy: mask code blocks/links first, then extract titles, highlights, bold, italic, tags, remarks via regex. This masking prevents false positives. Results are ordered by document block structure.

### Kernel API Access

`src/services/kernel.ts` is the facade for all SiYuan HTTP API calls. Batch operations (e.g., `getBlockKramdowns([ids])`) are preferred over per-block requests in loops.

## Module Conventions

- `core/` — pure business logic, named `*-core.ts`, tested by `tests/*-core.test.ts`
- `services/` — kernel API calls and data transformation
- `ui/` — DOM manipulation for panels and dialogs (no Vue components used in practice)
- `tests/` — mirrors module names; use deterministic inputs; mock SiYuan APIs

## Coding Style

- 2-space indentation, trimmed trailing whitespace, final newline (enforced by `.editorconfig`)
- Kebab-case file names
- ESLint: `@antfu/eslint-config` (`eslint.config.mjs`)
- Both English and Chinese acceptable in code comments and commit messages
- Commit message style: short direct summary, optional `type:` prefix (e.g., `fix:`, `feat:`)
- Keep `plugin.json` and `package.json` versions in sync — use `pnpm release:*` to do this automatically

## Key Files

| File | Purpose |
|------|---------|
| `src/plugin/plugin-lifecycle.ts` | Main plugin class, SiYuan lifecycle hooks |
| `src/plugin/action-runner.ts` | All 14 action implementations |
| `src/plugin/actions.ts` | Action key definitions, groups, metadata |
| `src/services/kernel.ts` | SiYuan kernel API facade |
| `src/services/key-info.ts` | Key-info extraction pipeline |
| `src/core/key-info-core.ts` | Regex-based inline extraction with masking |
| `src/ui/key-info-dock.ts` | Sidebar panel DOM component |
| `src/services/link-resolver.ts` | Backlink/forward-link resolution |
