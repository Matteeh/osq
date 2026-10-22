---
title: Rust osq retry recertifies a scope regression by rerunning its verify
depends_on: ["289"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage, rust-specs, rust-config, rust-harnesses]
---
## Goal

When a done task's files change after it finished, the watcher marks it
`scope_regression`. TypeScript's `osq retry <id> <n>` then reruns the
task's verify without an agent: a pass rewrites the done marker with the
new scope hash, and a fail requeues the task. Rust retry (277) refuses that
case and names the TypeScript command, so a human still needs TypeScript to
clear one. This change makes Rust retry recertify as TypeScript's
`retrySpec` and `refreshRecertifiedDoneMarker` do, with the same done
marker, `recertification` event, retained files and text. The expected
results come from TypeScript itself: goldens printed by the built `dist` on
a fixture project in this change folder, which task 1 copies into the
crate.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves that Rust retry leaves the same `.run`
tree and text as TypeScript for a passing, a failing and a long-output
verify and for a marker recertified before, that the scope files and the
rewritten marker text match TypeScript's on every table row, and that
every earlier retry golden still holds.

## Non-goals

- Stacked changes, changes in an osq worktree and archived changes; a task of an archived change is still refused, as TypeScript refuses it.
- The watcher's automatic recertification during a run and its `automatic` key.
- An `OSQ_DIFF` for the recertifying verify; TypeScript passes none for a checkout change with vcs off either.
- Recertifying with the scope audit's lock-file rule; TypeScript's retry hashes only the declared scope too.

## Surface

None

## Decisions

- ADR 022: recertification stays in the retry crate and calls only kernels: rust-specs for the task file and glob match, rust-config for limits and timeouts, rust-harnesses `run_verify` for the verify. The scope resolver is a port inside the crate, since rust-loop's `scope_files` keeps a pattern that matches nothing, which TypeScript's `resolveScope` drops.
- ADR 023: the scope hash, the differing paths, the output tail and the YAML writer are pure functions; one orchestrator reads the files, runs the verify and writes the marker and event.
- ADR 024: every public item ends its doc with `Implements: rust-retry/<requirement>`, and each test names `Covers: rust-retry/<scenario>`.
- ADR 025: the done marker, the retained files and the `recertification` event are written as TypeScript writes them, so TypeScript's watcher and `readRetryContext` read them unchanged.
- ADR 026: the task file and marker frontmatter are read through the specs kernel's `read_task_file` and `parse_frontmatter`.
- ADR 027: no scheduling changes.
- ADR 028: `RetryFeature` keeps its one command.
- ADR 029: config is loaded only for a recertification, for `limits.markerOutputLines`, `limits.markerLineChars` (from 289), `timeouts.verifyTimeout` and `timeouts.harnessKillGrace`.

## Assumptions

- 289, which adds `Config.limits`, is landed or stacked under this change before task 1 runs.
- The YAML writer covers the value kinds osq's done markers hold. It differs from TypeScript's `yaml` only where a string falls outside the plain set the spec lists, such as `-x` or `a b`, which Rust writes as a JSON string and TypeScript plain; a float is written as its source text, where TypeScript reformats it. Both read back the same.
- An exact scope entry with a `.` or `..` segment after its start is keyed by its normalized text, where TypeScript resolves it; no task scope in this repository has one.
- A verify that cannot start fails the retry and writes nothing, where TypeScript records it as requeued; `/bin/sh` always starts on Linux and WSL.
- Line lengths in the output tail count Unicode scalar values, where TypeScript counts UTF-16 units; they differ only above U+FFFF.
- Every golden was printed by `golden/print-recert-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-22, and every table value in the delta was printed by the same `dist`.

## Contract

### Requirement: Scope recertification

See `specs/rust-retry/spec.md`, with "Retry command", "Retry refusals",
"Retry record", "Scope recertification" and "Recertified done marker".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-retry/spec.md`: MODIFIED "Retry command", "Retry refusals" and "Retry record"; ADDED "Scope recertification" and "Recertified done marker".
- `fixture/recert-project/` holds the fixture project, and `golden/` the goldens and their script, that task 1 copies to `crates/features/retry/tests/fixtures/`.
