---
queue_item: rust-specs-api
queue_hash: sha256:10d13e3443973c2dc28a2c6374334ec196c893c6a01d454c194c180bcf4344ed
planner: null
date: 2026-10-20
---

### Goal

Before `rust-link-gates` makes every public function need an `Implements:` tag, the specs kernel's public surface shrinks to what other crates call, and the rest becomes private.

### Context

As of 2026-10-19:

- `crates/kernel/specs/src/lib.rs` re-exports from `document`, `markdown`, `merge`, `owners`, `read` and `validate`, and the crate holds about 65 public functions and modules.
- Outside the crate, only these are used: `CapabilityOwnership`, `Delta`, `Rename`, `Requirement`, `SpecsError`, `TaskFile`, `VerifyStarts`, `owner_capabilities`, `read_capability_ownership`, `read_delta`, `read_proposal` and `read_task_file` (storage), plus what the specs kernel's own tests and the parity tests use.
- ADR 024's rule "every public function has an `Implements:` tag" becomes blocking with `rust-link-gates`. `rust-adr-parse` adds ADR reading to this crate next.

### Requirements

- Every public item of the crate is either used by another crate, by the crate's integration tests through a documented entry point, or made private (`pub(crate)` or private module).
- The crate's tests and every other crate still build and pass, and no behaviour changes: every existing scenario of rust-specs stays proven.
- Every remaining public function keeps its `Implements:` tag.

### Non-goals

- Changing parsing, validation or merge behaviour.
- Narrowing other crates' APIs.
