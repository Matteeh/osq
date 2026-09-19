---
title: Align spec creation, test fixtures, and formatting with OpenSpec layout
depends_on:
  - "017"
features:
  reads:
    - cli-foundation
    - watcher-and-harness
    - status-inspection
    - spec-lint-and-approve
---
## Goal

Resolve all test suite and linter failures left after the OpenSpec layout cut-over in change 016, aligning `osq new` spec scaffolding, test fixtures, and code formatting with `openspec/changes` runtime defaults so `pnpm test` and `pnpm lint` pass cleanly across the repository.

1. **Spec Scaffolding Alignment (`createNewSpec`)**: Update `createNewSpec` in `src/core/new.ts` to default target directory resolution to `DEFAULT_CONFIG.paths.specs` (`openspec/changes`) rather than hardcoded legacy `'specs'`. Seed new change folders using OpenSpec starter templates (`proposal.md`, `tasks.md`, and `tasks/1.md`) with dynamic title replacement in `proposal.md`, fulfilling the contract defined in change 016.
2. **Test Fixture Path Alignment**: Update legacy test fixture setup in `tests/watcher-loop-logging.test.ts` and `tests/status.test.ts` to create fixtures under `openspec/changes` and `openspec/changes/archive` matching `DEFAULT_CONFIG`. Ensure all watcher, runner, and status test suites locate approved change folders seamlessly.
3. **Linter Formatting Conformance**: Format `src/core/migrate.ts` to satisfy Biome line-break formatting rules, ensuring `pnpm lint` completes with zero errors.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| `createNewSpec(projectDir, title)` | Creates change folder under `openspec/changes/<id>-<slug>/` containing `proposal.md`, `tasks.md`, and `tasks/1.md`; preserves optional `specsDirName` override |
| `tests/new.test.ts` | Asserts change folders scaffold under `openspec/changes/` with `proposal.md` |
| `tests/watcher-loop-logging.test.ts` | Creates broken spec fixture under `openspec/changes/099-broken`; logs watcher error at error level |
| `tests/status.test.ts` | Scans archived change folders under `openspec/changes/archive`; returns correct archived count |
| `src/core/migrate.ts` | Passes `pnpm exec biome check` with zero formatting errors |

## Non-goals

- Altering runtime watcher loop or execution gate mechanics.
- Reverting `DEFAULT_CONFIG` paths back to legacy `specs/` layout.
- Adding new external dependencies.

## Human steps

None. All modifications update internal scaffolding helpers, test fixtures, and file formatting.

## Delta

This change aligns internal scaffolding defaults and test suite fixtures with the OpenSpec layout established in change 016; no living capability requirement changes are introduced.
