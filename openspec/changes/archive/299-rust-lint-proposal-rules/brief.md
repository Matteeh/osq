---
queue_item: rust-lint-proposal-rules
queue_hash: sha256:ffa033c90e69b31cd0831769bc69c33f2d6847c38bdbb13021407a3bd6c54963
planner: null
date: 2026-10-22
---

### Goal

Rust `osq lint` runs the specs validation and link gates (275), but none of TypeScript's planner rules. Port the proposal rules first, since every plan hits them.

### Context

As of 2026-10-22:

- TypeScript checks them in `src/core/spec/assumptions.ts`, `human-steps.ts`, `decisions-lint.ts` and `banned-word-lint.ts`, collected by `src/core/spec/linter.ts`.
- 275 built `crates/features/lint`: one finding per line, then `<folder>: valid` or a count, non-zero on a blocking finding.
- `rust-config-lint-settings` gives `bannedWords`. The specs kernel parses ADRs (229).

### Requirements

- Rust `osq lint <id>` reports each of these rules' findings with TypeScript's text and severity, in TypeScript's order next to the existing findings.
- Tests run it on fixture changes that pass and that break each rule.

### Non-goals

- The task, scope and verify rules; later items port them.
