---
queue_item: rust-lint-task-rules
queue_hash: sha256:55388ddf761c323a2022b63014b391ad66f7fc7304aa87f5154e27f23b52a17c
planner: null
date: 2026-10-22
---

### Goal

After the proposal rules, the lint rules that catch most planning mistakes are the task rules: scope patterns, verify commands that name files and the `verify_starts` claim.

### Context

As of 2026-10-22:

- TypeScript checks them in `src/core/spec/verify-starts.ts`, `verify-paths.ts`, `brace-scope-lint.ts` and `entry-lint.ts`, plus the task checks in `linter.ts`, using the `limits` block.
- `rust-config-lint-settings` gives the limits; `rust-lint-proposal-rules` adds the first planner rules to `crates/features/lint`.
- `rust-lint-proposal-rules` (299) left out the `## Surface` rule (`readSurfaceSection` in `linter.ts`) to port here with the task rules. 299 also gives no finding when `proposal.md`'s frontmatter does not parse, where TypeScript reports a frontmatter error.

### Requirements

- Rust `osq lint <id>` reports these rules' findings with TypeScript's text and severity, in TypeScript's order next to the existing findings.
- It also reports TypeScript's `## Surface` finding and its proposal frontmatter error.
- Tests run it on fixture changes that pass and that break each rule.

### Non-goals

- Traceability, sidecar, impact and generated-move rules; later items port them.
