---
title: "Safe engine architecture: layout, markers, pure state, and line budgets"
depends_on: ['022']
features:
  reads:
    - cli-foundation
    - watcher-and-harness
  writes:
    - cli-foundation
    - watcher-and-harness
---
## Goal

Harden the engine architecture by completing the Phase 0 foundational refactorings:
1. **Parametrized Marker Invariant Test**: Expand `tests/runner-done-dead-events.test.ts` into a parametrized suite asserting marker plus event parity across every failure reason in `RunTaskFailureReason`, including `undeclared_test_change`.
2. **Consolidated Marker Writing & Pure Reaper Detection**: Centralize `.run/done` and `.run/dead` marker writing in `src/watcher/outcome.ts`. Restructure `reapStaleLocks` in `src/core/lock.ts` to detect and return expired locks without performing marker file I/O, leaving marker and event emission to the watcher loop.
3. **Canonical OpenSpec Path Layout**: Introduce `src/core/layout.ts` as the single canonical path derivation module for change folders and `.run/` artifacts. Remove `config.paths.specs` and `config.paths.archive` from `OsqPaths` in `src/core/config.ts`, deriving all change paths strictly from `openspecRoot`.
4. **Pure State Derivation from In-Memory Snapshots**: Separate change folder reading from state derivation by introducing `readChangeFolder` and refactoring `deriveSpecState` into a pure function operating on an in-memory snapshot.
5. **Source Line Budget Enforcement**: Introduce an automated test verifying that no file under `src/` exceeds 250 lines, governed by a strict temporary allow list (`report.ts`, `show.ts`, `opencode.ts`, `agy.ts`).

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Invariant suite execution | Parameterized test passes asserting paired marker and event for every `RunTaskFailureReason` variant |
| Task failure or completion | `src/watcher/outcome.ts` owns all marker file writes; reaper in `src/core/lock.ts` detects expired locks purely |
| Path resolution in config & core | `openspecRoot` is the single configurable path root; change and `.run` paths derive through `src/core/layout.ts` |
| State derivation execution | `deriveSpecState` is a synchronous pure function accepting a change snapshot; disk I/O isolated to `readChangeFolder` |
| Line budget verification | Test verifies no file under `src/` exceeds 250 lines, passing only for allow-listed files (`report.ts`, `show.ts`, `opencode.ts`, `agy.ts`) |

## Non-goals

- Altering harness process execution or event JSONL schemas.
- Refactoring the allow-listed legacy reporting modules (`report.ts`, `show.ts`).
- Modifying verification command execution or git commit detection.

## Human steps

None.

## Delta

This change introduces canonical OpenSpec path layout in `specs/cli-foundation/spec.md`, and consolidated marker writing, pure spec state derivation, and source line budget enforcement in `specs/watcher-and-harness/spec.md`.
