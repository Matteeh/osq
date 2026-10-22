---
title: Rust osq spec prints a capability's requirements or one requirement
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-specs, rust-cli]
---
## Goal

Planners and executors read living specs through `osq spec <capability>
<requirement>` many times per change. Rust has no `osq spec`, so no agent
can work on Rust osq alone. This change adds `spec` to the Rust show
feature, which already holds read-only inspection and is registered in the
CLI, so no crate is added. `osq spec`, `osq spec <capability>` and `osq spec
<capability> <requirement>` print what TypeScript's `specCommand` prints,
with its error text for an unknown capability or requirement. The expected
results come from TypeScript itself: goldens printed by the built `dist`
from a fixture in this change folder that task 1 copies into the crate.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves that Rust `spec` gives TypeScript's
output or error message on every golden row, refuses extra arguments, fails
on an unreadable `spec.md`, and that every earlier show test still holds.

## Non-goals

- `--json`.
- Reading `openspec.root` or any other path from config; Rust features read `openspec/` at the root, as plan and run do.
- A CLI test; the CLI already dispatches every command `ShowFeature` lists.

## Surface

- Added: `osq-rs spec [capability] [requirement]` (command)

## Decisions

- ADR 022: `spec` lives in the show feature crate and reads living specs through the specs kernel, as plan's prompt reads `openspec/specs`; it calls no other feature.
- ADR 023: listing, lookup and text are small named functions; one orchestrator reads the files.
- ADR 024: every public item ends its doc with `Implements: rust-show/<requirement>`, and each new test names `Covers: rust-show/<scenario>`.
- ADR 025: living specs are read from today's `openspec/specs/<capability>/spec.md` files as they are.
- ADR 026: the spec is parsed with the specs kernel's `read_living_spec` and names matched with its `normalize_requirement_name`; no Node openspec runs.
- ADR 027: no scheduling changes.
- ADR 028: `ShowFeature` lists a second command as data, and `run` dispatches on the invocation's command.
- ADR 029: `spec` reads no config; it reads `openspec/` at the root, as plan's prompt does.

## Assumptions

- A failure displays as `spec failed: <TypeScript's message>`, the core `FeatureError::failed` wrapper every Rust command uses, not TypeScript's bare message.
- More than two arguments fail with Rust's own usage text; TypeScript's commander prints `error: too many arguments for 'spec'. Expected 2 arguments but got 3.`
- Every golden was printed by `golden/print-spec-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-22.

## Contract

### Requirement: Spec command

See `specs/rust-show/spec.md`, with "Show command", "Spec command" and
"Spec arguments".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-show/spec.md`: MODIFIED "Show command"; ADDED "Spec command" and "Spec arguments".
- `fixture/spec-project/` holds the fixture living specs, and `golden/` the goldens and their script, that task 1 copies to `crates/features/show/tests/fixtures/`.
