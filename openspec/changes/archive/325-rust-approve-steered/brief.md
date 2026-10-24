---
queue_item: rust-approve-steered
queue_hash: sha256:4e4a45668cb23770a8c261766068ab56481c2953683199faccea6185d076c9fb
planner: null
date: 2026-10-23
---

### Goal

When a running change hits a steering trigger, the human edits the plan and runs `osq approve` again. Rust approve refuses every change with a steering trigger ("Steering refusal"), so steering still needs TypeScript.

### Context

As of 2026-10-24:

- TypeScript re-approves a steered change through `src/cli/approve.ts`; `deriveSteering` in `src/core/status/steering.ts` gives the triggers. Done tasks stay done (128).
- Rust approve (272, 292) has the steering refusal and worktree approval; `osq plan <id>` already writes the steering prompt (278, 291).

### Requirements

- Rust `osq approve <id>` on a steered change, in the checkout or its worktree, writes the same files, markers, events and commits as TypeScript, with its text, and keeps done tasks.
- The cases TypeScript still refuses stay refused with its text.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Stacked changes; `rust-approve-stacked` follows.
- Auto-steer.
