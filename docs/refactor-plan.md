# Refactor Plan

## 1. Project Snapshot

- Generated on: 2026-03-03
- Scope: `siyuan-doc-assist` plugin codebase (`src/`, `tests/`)
- Goal: Improve maintainability and change safety by reducing high-coupling modules, clarifying boundaries, and keeping behavior stable with test-first refactors.

## 2. Architecture and Module Analysis

| Module | Key Files | Current Responsibility | Main Pain Points | Test Coverage Status |
| --- | --- | --- | --- | --- |
| Entry + lifecycle orchestration | `src/index.ts`, `src/plugin/plugin-lifecycle.ts`, `src/plugin/plugin-lifecycle-events.ts` | Plugin bootstrap, event binding, command registration, doc context handoff | Lifecycle class currently owns orchestration + persistence + command wiring, making behavior changes cross-cutting | Good integration coverage via `tests/plugin-menu-registration.test.ts`, `tests/plugin-doc-context.test.ts`; limited direct unit tests for lifecycle internal branching |
| Action execution pipeline | `src/plugin/action-runner.ts`, `src/plugin/action-runner-context.ts`, `src/plugin/action-runner-dispatcher.ts` | Implements all doc actions, mutation flow, confirmations, messaging and error handling | `action-runner.ts` is very large (1000+ LOC), many responsibilities mixed (business rules + IO + UI messaging), high regression risk when adding actions | Strong scenario coverage in `tests/action-runner-loading.test.ts`, but tests are broad/integration-like and hard to localize failures |
| Markdown/link cleanup core | `src/core/markdown-cleanup-core.ts`, `src/core/link-core.ts`, `src/core/markdown-style-core.ts` | Pure text transforms for cleanup, link/ref conversion, style application | Rule sets are expanding quickly; regex-heavy logic has readability and composability risk | Good focused unit tests (`tests/markdown-cleanup-core.test.ts`, `tests/link-core.test.ts`, `tests/markdown-style-core.test.ts`) |
| Key-info data pipeline | `src/services/key-info.ts`, `src/services/key-info-*`, `src/core/key-info-core.ts` | Collects blocks/spans, normalizes inline/remark/highlight, computes ordering and outputs key-info items | Data collection, normalization, ordering and dedupe are split across many files with implicit contracts; hard to reason about end-to-end invariants | Broad coverage exists (`tests/key-info-*.test.ts`), but gap remains in contract-level tests for intermediate normalized shapes |
| Kernel adapters and block IO | `src/services/kernel.ts`, `src/services/kernel-block.ts`, `src/services/kernel-ref.ts`, `src/services/kernel-file.ts` | API adapters, payload normalization, SQL fallback logic, block markdown/DOM read-write | Request normalization and fallback behavior are duplicated across functions; API-shape parsing is hard to extend safely | Moderate coverage (`tests/kernel-*.test.ts`, `tests/block-lineage.test.ts`), missing targeted tests for some payload-shape edge cases |
| Dock UI and doc actions panel | `src/ui/key-info-dock.ts`, `src/ui/key-info-dock-doc-actions.ts`, `src/core/dock-*` | Renders dock UI, filters, tab state, action list interactions (favorite/reorder/register) | Large UI files mix state transition rules with DOM rendering and event wiring; complexity increases with new interactions | Good interaction tests (`tests/key-info-dock-scroll-interaction.test.ts`, `tests/dock-*.test.ts`) but still brittle due to coupled state+DOM logic |

## 3. Prioritized Refactor Backlog

| ID | Priority | Module/Scenario | Files in Scope | Refactor Objective | Risk Level | Pre-Refactor Test Checklist | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RF-001 | P0 | Decompose action execution pipeline | `src/plugin/action-runner.ts`, `src/plugin/action-runner-dispatcher.ts`, `src/plugin/action-runner-context.ts`, `tests/action-runner-loading.test.ts` | Split action-runner into action-specific handler modules + shared mutation utilities, keep command keys/messages stable | High | - [x] Baseline `action-runner` tests green; - [x] Add focused tests for extracted helpers (success/error/skipped paths); - [x] Verify no command key/message regression | done |
| RF-002 | P0 | Standardize text cleanup rule engine for markdown transforms | `src/core/markdown-cleanup-core.ts`, `src/core/link-core.ts`, `tests/markdown-cleanup-core.test.ts`, `tests/link-core.test.ts` | Extract reusable transform primitives and make cleanup rules composable/ordered deterministically | High | - [x] Add table-driven tests for rule ordering/idempotency; - [x] Preserve current outputs for existing cleanup/link scenarios; - [x] Verify no risky-block behavior change in runner integration tests | done |
| RF-003 | P1 | Clarify key-info pipeline contracts | `src/services/key-info.ts`, `src/services/key-info-collectors.ts`, `src/services/key-info-order.ts`, `src/services/key-info-model.ts`, `tests/key-info-*.test.ts` | Introduce explicit stage contracts (collect -> normalize -> order -> merge) and reduce implicit cross-file coupling | Medium | - [x] Add contract tests per stage input/output shape; - [x] Keep existing key-info output order and dedupe behavior; - [x] Re-run all key-info tests after each stage extraction | done |
| RF-004 | P1 | Separate dock state reducer from DOM rendering | `src/ui/key-info-dock.ts`, `src/ui/key-info-dock-doc-actions.ts`, `src/core/dock-*.ts`, `tests/key-info-dock-scroll-interaction.test.ts` | Isolate pure state transitions from imperative DOM operations to improve testability and reduce UI regressions | Medium | - [x] Add reducer/state transition tests independent from DOM; - [x] Keep existing interaction test expectations; - [x] Validate favorite/reorder/menu-toggle behavior parity | done |
| RF-005 | P1 | Consolidate kernel adapter parsing/fallback patterns | `src/services/kernel-block.ts`, `src/services/kernel.ts`, `src/services/kernel-ref.ts`, `src/services/kernel-shared.ts`, `tests/kernel-*.test.ts` | Centralize payload normalization helpers and fallback/retry flow to reduce duplication and edge-case drift | Medium | - [x] Snapshot current behavior for varied API payload shapes; - [x] Preserve SQL query and fallback semantics; - [x] Re-run kernel and dependent service tests | done |
| RF-006 | P2 | Action metadata consistency and UI mapping cleanup | `src/plugin/actions.ts`, `src/ui/key-info-dock-doc-actions.ts`, `src/core/dock-panel-core.ts`, `tests/plugin-actions.test.ts`, `tests/actions-grouping.test.ts` | Normalize action metadata definitions (group, icon fallback, labels) and remove duplicated mapping assumptions | Low | - [x] Assert all action keys/groups/icons in tests; - [x] Keep menu/command labels unchanged; - [x] Verify dock grouping order remains unchanged | done |

Priority definition:
- `P0`: highest value and risk, execute first
- `P1`: medium value or risk, execute after P0
- `P2`: low-risk cleanup, execute last

Status definition:
- `pending`
- `in_progress`
- `done`
- `blocked`

## 4. Execution Log

| ID | Start Date | End Date | Test Commands | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| RF-001 | 2026-03-03 | 2026-03-03 | `./node_modules/.bin/vitest run tests/action-runner-block-transform.test.ts tests/action-runner-loading.test.ts` + `./node_modules/.bin/vitest run` | pass | Extracted shared block markdown transform runner to `src/plugin/action-runner-block-transform.ts`, and reused it in `toggle-links-refs` / `mark-invalid-links-refs` / `clean-ai-output` without message or behavior regression. |
| RF-002 | 2026-03-03 | 2026-03-03 | `./node_modules/.bin/vitest run tests/markdown-cleanup-core.test.ts tests/link-core.test.ts tests/action-runner-loading.test.ts` + `./node_modules/.bin/vitest run` | pass | Refactored cleanup/marking to explicit rule pipelines: ai-output line rules in `markdown-cleanup-core` and invalid-link mark rules in `link-core`, preserving existing behavior and idempotency. |
| RF-003 | 2026-03-03 | 2026-03-03 | `./node_modules/.bin/vitest run tests/key-info-pipeline.test.ts tests/key-info-merge.test.ts tests/key-info-service-heading-inline.test.ts tests/key-info-inline.test.ts tests/key-info-core.test.ts` + `./node_modules/.bin/vitest run` | pass | Introduced explicit key-info pipeline module `src/services/key-info-pipeline.ts` with contract functions for append-title, normalize, and sort stages; `getDocKeyInfo` now composes those stages explicitly without behavior drift. |
| RF-004 | 2026-03-03 | 2026-03-03 | `./node_modules/.bin/vitest run tests/key-info-dock-state.test.ts tests/key-info-dock-scroll-interaction.test.ts tests/dock-*.test.ts` + `./node_modules/.bin/vitest run` | pass | Added pure dock-state module `src/ui/key-info-dock-state.ts` for render trigger derivation and filter/tab active checks; `src/ui/key-info-dock.ts` now consumes it while keeping existing interaction behavior unchanged. |
| RF-005 | 2026-03-03 | 2026-03-03 | `./node_modules/.bin/vitest run tests/kernel-adapter-core.test.ts tests/kernel-kramdown-compat.test.ts tests/kernel-child-blocks.test.ts` + `./node_modules/.bin/vitest run tests/kernel-*.test.ts tests/action-runner-loading.test.ts` + `./node_modules/.bin/vitest run` | pass | Added shared kernel adapter helpers in `src/services/kernel-adapter-core.ts` to centralize payload normalization (`parseKernelTextRows`) and batch-to-single fallback flow (`requestBatchRowsWithSingleFallback`); reused by kramdown/DOM loaders in `kernel-block` with behavior parity. |
| RF-006 | 2026-03-03 | 2026-03-03 | `./node_modules/.bin/vitest run tests/plugin-actions.test.ts tests/actions-grouping.test.ts tests/dock-panel-core.test.ts tests/key-info-dock-scroll-interaction.test.ts` + `./node_modules/.bin/vitest run tests/plugin-menu-registration.test.ts tests/key-info-controller-doc-action.test.ts tests/actions-grouping.test.ts tests/plugin-actions.test.ts` + `./node_modules/.bin/vitest run` | pass | Added unified action metadata field `dockIconText` in `src/plugin/actions.ts`, wired through `buildDockDocActions`, and removed hardcoded icon-text map from dock UI by resolving from action metadata with safe fallback; labels/groups stay unchanged. |

## 5. Decision and Confirmation

- User approved items: RF-001（done）, RF-002（done）, RF-003（done）, RF-004（done）, RF-005（done）, RF-006（done）
- Deferred items:
- Blocked items and reasons:

## 6. Next Actions

1. Refactor backlog RF-001 ~ RF-006 completed; continue with optional follow-up hardening only if needed.
2. If expanding command set in future, add new action metadata in `src/plugin/actions.ts` first and rely on shared mapping.
