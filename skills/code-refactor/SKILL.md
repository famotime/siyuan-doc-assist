---
name: code-refactor
description: Structured refactoring workflow for codebases that require architecture analysis, prioritized refactor planning, user approval gates, test-first execution, and continuous progress sync. Use when users ask to analyze project modules, create docs/refactor-plan.md, refactor item by item, and verify behavior with automated tests before and after each change.
---

# Code Refactor Workflow

## Goal

Deliver safe and traceable refactoring with three hard gates:
1. Write prioritized plan to `docs/refactor-plan.md`.
2. Wait for user approval before implementation.
3. Create or adjust tests before refactor and pass tests after refactor.

## Required Workflow

### 1. Analyze project and identify refactor candidates

Inspect the repository first, then build a module-level map:
- Entry and lifecycle (`src/index*`, plugin bootstrap files)
- Business and core logic (`src/core/`, `src/services/`)
- UI and controller orchestration (`src/plugin/`, `src/ui/`, `src/components/`)
- Type and schema boundaries (`src/types/`)
- Existing tests (`tests/`)

For each candidate, capture:
- Current responsibility and dependency boundaries
- Refactor value (complexity, duplication, coupling, testability, bug risk)
- Risk of behavior regression
- Test coverage gaps and required scenarios

Prioritize with explicit labels:
- `P0`: high value plus high risk or high-frequency impact, do first with strict tests
- `P1`: medium risk or medium value, do after P0
- `P2`: cleanup and consistency improvements, do last

### 2. Write plan to docs/refactor-plan.md

Create or overwrite `docs/refactor-plan.md` before any refactor code change.
Use `references/refactor-plan-template.md` as the default structure.

The plan must include:
- Module and function analysis summary
- Prioritized refactor items (`P0/P1/P2`)
- Per-item scope (files), expected behavior invariants, and risk
- Pre-refactor test checklist per scenario
- Progress status (`pending`, `in_progress`, `done`, `blocked`)

### 3. Confirm plan with user

After writing `docs/refactor-plan.md`, stop and ask for explicit approval.
Do not start refactoring until the user confirms which items to execute.

### 4. Execute refactor item by item (test first)

For each approved item:
1. Define concrete scenarios and expected behaviors.
2. Add or update automated tests first (`tests/*.test.ts`) for those scenarios.
3. Run targeted tests for the module.
4. Refactor implementation with minimal behavior change.
5. Run targeted tests again and then full test suite (`pnpm test`).
6. Fix regressions before moving to the next item.

### 5. Sync progress immediately after each item

Update `docs/refactor-plan.md` right after each item:
- status change (`pending` -> `in_progress` -> `done` or `blocked`)
- completed tests and command evidence
- notes on scope changes, risks, or follow-up tasks

Keep plan state consistent with actual repository state at all times.

## Execution Rules

- Refactor one approved item at a time.
- Avoid unrelated changes while executing a planned item.
- Prefer deterministic tests over manual verification.
- If unexpected repository changes appear, pause and ask user before proceeding.
- If baseline tests fail before refactor, record this in the plan and isolate failures first.

## Output Contract

When this skill is used, outputs must be in this order:
1. `docs/refactor-plan.md` with prioritized recommendations.
2. User confirmation request referencing plan item IDs.
3. Iterative refactor and test updates per approved item.
4. Final summary with completed items, skipped items, and test results.

## Resources

- `references/refactor-plan-template.md`: canonical structure for plan file creation and progress updates.
