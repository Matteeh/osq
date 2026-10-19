---
queue_item: rust-specs-parity
queue_hash: sha256:0e2f05a7bf05aa8c3e65d9de44d5a0aea16d1a0c9aee5c863b5749b1334eead3
planner: null
date: 2026-10-18
---

### Goal

ADR 026's enforcement is in place: drift from upstream OpenSpec shows up in CI, and no Rust crate runs Node at runtime.

### Context

As of 2026-10-18:

- ADR 026 section 4 keeps a pinned `@fission-ai/openspec` as a dev-only CI tool for a validate parity check (pass or fail per item, Rust against `openspec validate --strict --json`) and an archive parity check (the Rust merge against `openspec archive` on living specs), both also run weekly against `@latest`.
- `.github/workflows/openspec-latest.yml` runs `tests/openspec-differential.test.ts` against `@latest` every Monday. `.github/workflows/rust.yml` runs the Rust checks.
- ADR 026 Enforcement asks for a lint gate that fails if any crate outside dev tooling spawns `openspec`, `node` or `npx`, found with `syn` by looking for `Command::new` with those names, and for its `checks` frontmatter to name the parity and golden tests once they exist.

### Requirements

- The validate and archive parity checks run in CI against the pinned CLI and in the weekly job against `@latest`.
- The no-runtime-Node gate runs in `sh scripts/verify-rust.sh`, with a fixture crate that spawns `node` to prove it fails.
- ADR 026's `checks` names the new tests.

### Non-goals

- Removing the TypeScript code's use of the Node CLI, or ADRs 004 and 005; that happens when the TypeScript code is deleted.
