---
title: Split runner.ts by lifecycle phase and freeze the import graph
depends_on:
  - "020"
features:
  reads:
    - watcher-and-harness
---
## Goal

Decompose `src/watcher/runner.ts` into discrete lifecycle modules—`lock.ts`, `spawn.ts`, `heartbeat.ts`, `verify.ts`, and `outcome.ts`—each strictly under 200 lines of code, reducing `runner.ts` to the top-level orchestration sequence under 200 lines. Freeze the codebase import graph with an automated test enforcing directional layering (`src/core` never imports from other src directories, `src/harness` never imports from `watcher` or `cli`, and `src/watcher` never imports from `cli`), resolving the existing reverse import of `WatchCommandOptions` from `cli` into `watcher`.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Module line budget | `lock.ts`, `spawn.ts`, `heartbeat.ts`, `verify.ts`, `outcome.ts`, and `runner.ts` each contain fewer than 200 lines of code |
| Task execution sequence | `runTask` in `src/watcher/runner.ts` coordinates lock acquisition, heartbeat observation, agent process execution, test gating, verification, and outcome recording across dedicated lifecycle modules |
| Public behavior and tests | Public runner behavior is unchanged; all existing tests pass with updated import paths to the new lifecycle modules |
| `src/core` import boundary | Fails test if any module in `src/core/**` imports from any directory outside `src/core` |
| `src/harness` import boundary | Fails test if any module in `src/harness/**` imports from `src/watcher/**` or `src/cli/**` |
| `src/watcher` import boundary | Fails test if any module in `src/watcher/**` imports from `src/cli/**` |
| Dev mode CLI options | `WatchCommandOptions` is declared in `src/watcher/dev.ts` and consumed by `src/cli/watch.ts` |

## Non-goals

- Altering marker file locations, event formats, or the zero-trust verification protocol.
- Splitting the repository into multiple packages or workspaces.
- Introducing new runtime or build dependencies.

## Human steps

None.

## Delta

This change decomposes `src/watcher/runner.ts` into discrete lifecycle modules under 200 lines each and enforces strict import graph boundaries via capability delta specifications in `specs/watcher-and-harness/spec.md`.
