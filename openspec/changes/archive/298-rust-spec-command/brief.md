---
queue_item: rust-spec-command
queue_hash: sha256:5b15391c2920498b337da48c4f84864b9d995b8a51df4956adc559f68531bb55
planner: null
date: 2026-10-22
---

### Goal

Planners and executors read living specs through `osq spec <capability> <requirement>` many times per change. Rust has no `osq spec`, so no agent can work on Rust osq alone.

### Context

As of 2026-10-22:

- TypeScript prints it in `specCommand` in `src/cli/spec.ts` through `lookupRequirement` in `src/core/spec/requirement-lookup.ts`: no argument lists capabilities, one lists a capability's requirements, two print one requirement.
- The specs kernel parses living specs. `crates/features/show` already holds the read-only inspection commands and is registered in the CLI, so the command goes there and no crate is added.

### Requirements

- Rust `osq spec`, `osq spec <capability>` and `osq spec <capability> <requirement>` print what TypeScript prints, with its error text for an unknown capability or requirement.
- Goldens are printed by TypeScript's `dist` from a fixture and committed in the change folder.

### Non-goals

- `--json`.
