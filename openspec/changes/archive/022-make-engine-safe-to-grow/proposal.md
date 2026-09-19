---
title: Make the engine safe to grow
depends_on:
  - "021"
features:
  reads:
    - cli-foundation
    - watcher-and-harness
---
## Goal

Harden event streams, test fixtures, repository diagnostics, and planning governance:
1. Enforce a typed discriminated event union across all harness and watcher events, relativize tool summaries to project root at write time, enrich the `started` event with `harness`, `model`, and `osqVersion`, and ensure a single code path emits each event.
2. Add an end-to-end golden events test suite against checked-in fixtures for verified and dead tasks using the mock harness, with a documented regenerate command.
3. Provide an `osq doctor` CLI command performing 5 discrete health checks (config loads, harness `--version`, managed blocks current, no orphaned locks, archives validate) outputting one line per check and non-zero on failure.
4. Scaffold and maintain `PLANNER.md` with an `<!-- OSQ:START -->` / `<!-- OSQ:END -->` managed block in `osq init` alongside `AGENTS.md`.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| `osq init` execution | Scaffolds or updates `PLANNER.md` with the current managed planner instructions block |
| Lifecycle `started` event | Includes `harness`, `model`, `osqVersion`, `commit`, `pid`, and `timeoutSeconds` under event `data` |
| Tool observation | Tool summaries relativize absolute workspace paths to project root before appending to `events.jsonl` |
| Event emission paths | Single code path per event type (`spawn.ts` emits `started`/`exited`; `mock.ts` does not duplicate lifecycle events) |
| Golden events test | End-to-end task runs with normalized fields match `tests/fixtures/events/verified.jsonl` and `dead.jsonl` |
| `osq doctor` on healthy checkout | Prints one line per check (`config`, `harness`, `managed-blocks`, `locks`, `archives`) and exits 0 |
| `osq doctor` on check violation | Prints failing check line and exits non-zero (code 1) |

## Non-goals

- Altering external harness API protocols for OpenCode or AGY.
- Refactoring unrelated legacy modules (`report.ts`, `linter.ts`, etc.).
- Introducing new external runtime dependencies.

## Human steps

None.

## Delta

This change introduces repository health diagnostics and planner instruction scaffolding via capability delta specifications in `specs/cli-foundation/spec.md`, and typed event hygiene with golden test fixture validation in `specs/watcher-and-harness/spec.md`.
