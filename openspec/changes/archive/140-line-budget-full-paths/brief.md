---
queue_item: line-budget-full-paths
queue_hash: sha256:83b121793fab7af94079e696433defc86be0d46cbf3a7170897efd30942be4d7
planner: null
date: 2026-10-02
---

### Goal

`tests/line-budget.test.ts` exempts only the exact files on its allow list, so a new file over 250 lines fails however it is named.

### Context

As of 2026-10-02:

- The test skips any file whose basename is on `ALLOW_LIST`: `report.ts`, `show.ts`, `opencode.ts`, `agy.ts`, `linter.ts`, `loop.ts`, `migrate.ts`, `delta.ts`, `parser.ts`, `types.ts`.
- So `src/cli/report.ts` passes only because it shares a name with `src/core/report/report.ts`, and any future `types.ts` or `parser.ts` anywhere is exempt. Under ADR 006 a gate either blocks or goes.
- From "Refactoring candidates" on the Notion roadmap, item 4.

### Requirements

- The allow list holds paths relative to `src/`, and the test matches them exactly.
- Every file it exempts today that is over 250 lines stays exempt by its full path. A listed path that no longer exists, or is now under 250 lines, fails the test, so the list only shrinks.
- A file over 250 lines that isn't listed fails, naming the file and its line count.

### Non-goals

- Splitting any file.
- The function budget, which already keys by path and function name.

### Notes for planning

- Measure which basename matches are over the budget today; any that pass only by name either get split or get listed by full path, and the proposal says which.
