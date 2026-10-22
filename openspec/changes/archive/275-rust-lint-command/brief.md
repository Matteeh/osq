---
queue_item: rust-lint-command
queue_hash: sha256:fd067c88a71b7ef99393d2032dc24eaf7b36d25a1189cb0067e97fa68e10057d
planner: null
date: 2026-10-22
---

### Goal

The specs kernel validates deltas and the linter kernel runs the link gates, but no Rust command runs them on a change. `osq lint <id>` in Rust should run both and print the findings, so the Rust gates can be used before TypeScript's lint is ported in full.

### Context

As of 2026-10-22:

- TypeScript's lint is `src/cli/lint.ts` over `src/core/spec/lint*.ts`. It checks proposals, tasks, scopes and verifies, and runs the Rust link gates through `rust-linter`.
- The specs kernel validates a change's deltas (217). The linter kernel gives `change_link_gates` (232, 238, 263).
- `rust-feature-scaffolds` gives an empty `osq-feature-lint` crate.

### Requirements

- `osq lint <id>` in Rust prints each specs-validation and link-gate finding of the change, one per line, then `<folder>: valid` or a count, and fails with a non-zero exit when any finding blocks.
- Tests run it on fixture changes with no findings, a delta error and a link-gate error.

### Non-goals

- The TypeScript planner rules about proposals, tasks, scopes and verifies; later items port them.
- `--repository`.
