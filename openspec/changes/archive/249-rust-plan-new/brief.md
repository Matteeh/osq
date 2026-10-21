---
queue_item: rust-plan-new
queue_hash: sha256:9df9cbbc65726560c772d18b688eb22867daa0286689da31b79c5308d15c65e2
planner: null
date: 2026-10-21
---

### Goal

`osq plan --next` is deterministic up to the moment a planner starts: pick the next item, number the change, write the folder. Rust does that part, so the run feature can later hand the folder to a planner.

### Context

As of 2026-10-21:

- `rust-plan-queue` gives the plan feature the parsed queue and each item's state.
- TypeScript: `src/cli/plan-queue.ts` (next item, `Depends on` checks), `src/core/foundation/change-number.ts` (`nextChangeNumber`, which looks across the checkout and worktrees), `src/core/foundation/new.ts` (`createNewSpec`, `slugify`, the fallback proposal), and the `plan-prompt.md` writer in `src/core/foundation/plan-handoff.ts`.
- Rust reads no worktrees yet (see 244's assumptions).

### Requirements

- The plan feature's `plan` command with `--next` picks the item `osq plan --next` would pick, refuses with TypeScript's message when the next item's dependencies are not landed, and otherwise writes the change folder: `brief.md` with the item's body word for word, the proposal and task templates, and `plan-prompt.md`, byte for byte as TypeScript writes them.
- The change number is the one `nextChangeNumber` gives for the checkout's folders.
- A golden test compares a created folder with one TypeScript created once and committed.

### Non-goals

- Starting the planner, scratch worktrees, steering and `--run`.
- Numbering across worktrees; it comes when Rust reads them.
