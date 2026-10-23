---
queue_item: rust-plan-steer
queue_hash: sha256:048d0998548ac1502e7e78206773514140497f433b933d196db8de287cfa1e38
planner: null
date: 2026-10-22
---

### Goal

When a change needs steering, `osq plan <id>` hands the planner a prompt naming each trigger, its evidence and the requirements that changed. Rust's plan feature plans new changes only.

### Context

As of 2026-10-22:

- TypeScript builds the steering prompt in `src/cli/plan-steer.ts` and `src/cli/plan-steer-prompt.ts`, finding the change with `findSteeringChange` in `src/core/status/steering-change.ts`.
- The Rust inbox derives the same triggers (244, 270). The plan feature writes `plan-prompt.md` for new changes (249, 255).

### Requirements

- `osq plan <id>` on an active or archived change that needs steering writes the same prompt TypeScript writes, for blocked, stuck, regression, conflict and requirement-changed triggers.
- Goldens are printed by TypeScript's `dist` from fixture changes and committed in the change folder.

### Non-goals

- Starting the planner, auto-steer, and the default-branch requirement text when vcs is off.
