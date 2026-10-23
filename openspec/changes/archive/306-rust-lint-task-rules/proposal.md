---
title: Rust osq lint checks tasks' scope, verify and verify_starts
depends_on: ["299"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-specs, rust-loop, rust-vcs, rust-storage]
---
## Goal

Rust `osq lint` reports TypeScript's proposal rules for `## Assumptions`
and `## Decisions` (299), but none of the task rules that catch most
planning mistakes. This change ports them: each task's frontmatter,
acceptance lines, `tests.modify`, frozen tests, verify command, limits and
brace groups, then the entry paths, then the shared-scope, unresolved
verify and `verify_starts` warnings, with TypeScript's text, severity and
order. It also ports the proposal rules 299 left out: the frontmatter YAML
error, the declared `verify`, the `## Surface` section and the change-level
verify analysis.

The lint fixture project's changes have no tasks, no `verify` and no
`## Surface`, so every existing lint test would break on the new rules.
Task 1 gives each fixture change a clean `proposal.md` and `tasks/1.md`
and updates the two test rows whose expected output changes.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, every Rust test, the link gates and the mutation check of the
changed lines. It proves that `lint` gives TypeScript's proposal, verify,
task and entry findings, in order, for every row of the rust-lint
scenarios, and that every existing lint row still holds on the updated
fixture.

## Non-goals

- Control characters in change files, `features.writes`, the capability relation, contract table, `depends_on` and `fixes` rules; a later item ports them.
- Traceability, sidecar, impact and generated-move rules, as the brief says.
- TypeScript's legacy `spec.md` change document and `paths.openspecRoot`; Rust reads `openspec/` at the root, as 275 does.
- Moving the dependency-state reader that approve's `stack/state.rs` holds into a kernel; the lint crate reads the approved marker itself.

## Surface

- Changed: `osq-rs lint <id>` (command): reports the proposal verify, Surface and frontmatter findings and every task, verify and entry finding TypeScript's lint gives

## Decisions

- ADR 022: every rule lives in the lint feature crate and reads through kernels: rust-loop `scope_files`, rust-vcs `root`, `line_endings`, `default_branch` and `path_exists`, and rust-storage `list_changes`; no feature calls another.
- ADR 023: each rule is a small pure function over text and resolved paths; one orchestrator in `lint.rs` reads the files and calls them in TypeScript's order.
- ADR 024: every public item ends its doc with `Implements: <capability>/<requirement>`, and each new test names `Covers: <capability>/<scenario>`.
- ADR 025: task files, `package.json` and `.run/approved` markers are read from today's files as they are.
- ADR 026: frontmatter comes from rust-specs `parse_frontmatter`, task fields from `parse_task_file`, the proposal's `verify` from `parse_proposal`.
- ADR 027: no scheduling changes.
- ADR 028: `LintFeature`'s command list is unchanged; only what `lint` checks grows.
- ADR 029: `limits.maxAcceptanceLines`, `limits.maxScopeFiles`, `vcs.enabled` and `vcs.defaultBranch` come from `load_config`.

## Assumptions

- A frontmatter YAML error's line and message come from Rust's YAML parser, so they can differ from TypeScript's (`title: [` is line 3 in Rust and line 2 in TypeScript). With such an error the proposal gives no other proposal finding, where TypeScript still checks the sections on the whole file.
- The languages and test folders follow TypeScript's language map: tracked files when the root is a git repository's top folder, plus the root manifests; only Rust's `cargo` runner and test folders matter, since the other presets have none.
- With git on, an entry another change provides is found by its `osq/<folder>` branch or its checkout or stacked folder, as approve's dependency-state reader finds it; a change whose archive folder is on the default branch has landed and provides nothing.
- Expected values were taken from `linter.ts`, `verify-paths.ts`, `verify-starts.ts`, `brace-scope-lint.ts` and `entry-lint.ts` as of 2026-10-23; the verify analysis rows were checked against the built `dist`.

## Contract

See `specs/rust-lint/spec.md`: MODIFIED "Lint findings", "Lint proposal
rules" and "Lint banned words"; ADDED "Lint verify commands", "Lint task
rules" and "Lint entry paths".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-lint/spec.md`: MODIFIED "Lint findings", "Lint proposal rules" and "Lint banned words"; ADDED "Lint verify commands", "Lint task rules" and "Lint entry paths".
- `crates/features/lint/src/lint.rs` is shared by tasks 1, 2 and 3, in that order: each adds its rules' call to the orchestrator.
