---
queue_item: rust-link-gates
queue_hash: sha256:6bce75fffe576151fbdc442176bc47d2b70aa1cdd4625b8247fb0cf7c3d4e882
planner: null
date: 2026-10-20
---

### Goal

Every Rust crate is checked against the link graph from now on, so ownership, references and tags can't drift while the rest of the rewrite is built.

### Context

As of 2026-10-19:

- ADR 024 section 3 lists the rules. Four of them hold for the repository as a whole and need no change folder: every governed file is owned by exactly one capability; every capability has a spec with a Purpose and at least one requirement and owns at least one file; no broken references (`applies_to`, `superseded_by`, `Implements:`, `Adr:` and `Covers:` point at things that exist and are live); every public function has an `Implements:` tag. All four are blocking.
- The rules about a single change, the llvm-cov coverage check, ADR checks before land and the departure gate need the plan, approve, archive and land features, which don't exist in Rust yet.
- `sh scripts/verify-rust.sh` is the one script CI and every Rust change's verify run. 219 added the no-runtime-Node gate there with a fixture crate that proves it fails.
- ADR 006: a gate blocks or it goes.

### Requirements

- The linter kernel runs each of the four rules over the graph from `rust-link-graph` for the Rust crates, and each finding names the file and line and gives one fix.
- `sh scripts/verify-rust.sh` runs them and fails on any finding.
- Each rule has a fixture that breaks it and a test that sees the finding.
- If the repository breaks a rule today, the change fixes the tags or ownership in the same change rather than adding an exception list.
- ADR 024's `checks` names the new tests.

### Non-goals

- The per-change rules, the coverage and mutation checks, the departure gate and the archive writer.
- Applying the rules to the TypeScript code under `src/`.
