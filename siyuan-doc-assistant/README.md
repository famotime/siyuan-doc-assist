# Doc Assistant for SiYuan

[简体中文](./README_zh_CN.md)

A SiYuan plugin for organizing document links and cleaning duplicate notes.

## Plugin Info

- Plugin name (`plugin.json`): `doc-assistant`
- Display name: `Doc Assistant` (`zh_CN`: `文档助手`)
- Min SiYuan version: `3.5.7`
- Current version: `0.0.1`

## Features

1. Export current document only.
2. Export current document with media files as a zip when local assets are detected.
3. Insert backlink document list into current document body.
4. Export backlink documents as markdown zip.
5. Export forward-linked documents as markdown zip.
6. Move backlink documents under current document as children (desktop only, auto-rename on title conflict).
7. Detect duplicate documents in current level by title similarity and delete selected duplicates (desktop only, default threshold `0.85`).

## Where To Use

- Command palette: all actions are registered as plugin commands.
- Editor title menu: open a document, click title icon menu, then run Doc Assistant actions.

## Development

Prerequisites:

- Node.js
- pnpm

Setup:

```bash
pnpm install
```

Create local env:

```bash
cp .env.example .env
```

Set `VITE_SIYUAN_WORKSPACE_PATH` in `.env` to your local SiYuan workspace path.

Run watch build:

```bash
pnpm dev
```

In watch mode, build output goes to:

`<SiYuan workspace>/data/plugins/<plugin.json.name>`

## Build

```bash
pnpm build
```

This produces:

- `dist/` plugin files
- `package.zip` (for release upload)

## Test

```bash
pnpm test
```

Current tests cover core modules in `tests/`:

- link parsing and dedupe
- move conflict planning
- duplicate title detection logic
- markdown/media export helpers
- zip download path handling

## Release

Manual release helpers:

```bash
pnpm release
pnpm release:manual
pnpm release:patch
pnpm release:minor
pnpm release:major
```

`release.js` updates `plugin.json` + `package.json`, creates commit/tag, and pushes to origin.

GitHub Action (`.github/workflows/release.yml`) creates a release when tag `v*` is pushed and uploads `package.zip`.
