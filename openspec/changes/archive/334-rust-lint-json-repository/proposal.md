---
title: Rust osq lint takes several ids, --json and --repository
depends_on: []
verify: cargo test -p osq-core -p osq-cli -p osq-feature-lint
features:
  reads: [rust-specs, rust-storage, rust-config, rust-linter]
---
## Goal

Rust `osq lint` checks exactly one change and prints text. TypeScript's
`osq lint [ids...]` checks several changes at once, every active change
with no id, reports the findings about other changes and living specs as
a count line or, with `--repository`, in full, and with `--json` prints
one document for tools. This change ports those to the lint crate.

TypeScript's findings come from the OpenSpec CLI, which Rust never runs
(ADR 026), and its own text differs from the Rust text rust-lint already
specifies. So this change ports the shape, not the bytes of the findings:
the same arguments, the same exit codes, TypeScript's repository count
line and header, and TypeScript's JSON document built by `buildLintJson`,
filled with the findings the Rust checks give. The repository findings are
the rust-specs validation of every other active change and of the living
specs, the Rust equivalent of TypeScript's `openspec validate --changes`
and `--specs` issues that fall outside the linted change.

A JSON document of an invalid change is printed on stdout and still exits
1. Core's `Output` has no exit code today, so it gains `code`, set by the
new `Output::with_code`, and `run_cli` returns it.

## Verify

`cargo test -p osq-core -p osq-cli -p osq-feature-lint` runs every test of
the three crates the change writes. It proves the output exit code from
the constructor through `run_cli`, the new arguments, several changes and
none, the repository count line and list on the lint fixture project, and
that each `--json` document equals a golden printed by TypeScript's
`buildLintJson`. The watcher also runs cargo-mutants on the touched lines.

## Non-goals

- New lint rules.
- Byte parity of the findings with TypeScript, whose findings come from the OpenSpec CLI; see Assumptions.
- TypeScript's plan-ready record, which its `lint` writes for a valid change given by id; Rust `lint` writes no file.
- Linting a change in a worktree, which TypeScript's `findSteeringChange` finds; Rust `lint` still finds active changes in the checkout.
- Link gate findings of other changes in the repository findings; TypeScript's repository findings are OpenSpec's only.

## Surface

- Changed: Rust `osq lint` takes zero or more ids; with none it checks every active change.
- Added: Rust `osq lint --json` (flag).
- Added: Rust `osq lint --repository` (flag).
- Added: the Rust repository count line and repository lines after the change blocks.

## Decisions

- ADR 022: the lint crate reads the other changes and the living specs through rust-storage's `list_changes` and rust-specs' validation, and calls no other feature.
- ADR 023: the repository lines and the JSON document are built by pure functions over the findings; `run_lint` stays the one orchestrator that reads files.
- ADR 024: every public item ends its doc with `Implements: <capability>/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: nothing on disk changes; the JSON document is TypeScript's shape.
- ADR 026: the repository findings come from rust-specs, never from the OpenSpec CLI, which is why they are not TypeScript's bytes.
- ADR 027: no scheduling changes.
- ADR 028: `LintFeature` stays a unit struct with one `Command`; `Output` gains a field behind `#[non_exhaustive]` and a constructor, so no other feature crate changes.
- ADR 029: `lint` reads `osq.toml` through `load_config` only, and adds no key.

## Assumptions

- The JSON `file` of a spec finding is `<file>:<line>`, since TypeScript's finding shape has no line field; tools that split on the last `:` get the line back.
- The repository findings of another active change are its `validate_change` findings only, without the merged validation, as `openspec validate --changes` checks each change on its own.
- The goldens hold TypeScript's document shape filled with the Rust findings, printed by `golden/print-lint-goldens.mjs.txt` with this repository's built `dist` on 2026-10-24; TypeScript's CLI cannot lint the fixture, since the fixture has no OpenSpec install.
- A Notion planning ticket holds the long-term design of lint: the repository scope, one text format for both CLIs, a line field in the JSON, and lint in server mode.

## Contract

### Requirement: Output exit code

See `specs/rust-core/spec.md`, MODIFIED "Feature constructors", and
`specs/rust-cli/spec.md`, MODIFIED "Command dispatch".

### Requirement: Several ids and repository findings

See `specs/rust-lint/spec.md`: MODIFIED "Lint command", "Lint arguments",
"Lint lookup" and "Lint findings", and ADDED "Lint repository findings".

### Requirement: Lint JSON

See `specs/rust-lint/spec.md`, ADDED "Lint JSON".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-core/spec.md`: MODIFIED "Feature constructors", with the new scenario "Output exit codes".
- `specs/rust-cli/spec.md`: MODIFIED "Command dispatch", with the new scenario "Output code through run_cli".
- `specs/rust-lint/spec.md`: MODIFIED "Lint command" (usage), "Lint arguments" (rows replaced, new scenario "Lint with no change"), "Lint lookup" (new scenario "Lint stops at a missing id") and "Lint findings" (blocks, new scenario "Lint several fixture changes"); ADDED "Lint repository findings" and "Lint JSON".
- Shared file: `crates/features/lint/src/**` is in the scope of tasks 2 and 3; task 3 runs after task 2 and extends the files task 2 writes.
