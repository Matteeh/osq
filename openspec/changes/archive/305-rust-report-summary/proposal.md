---
title: Rust osq report prints the summary and current task counts
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-specs, rust-config, rust-vcs]
---
## Goal

`osq report` is how a human sees how osq is doing, and Rust has no
`osq report`. TypeScript's report is large, so this change ports it in
slices, starting with its header and its `Specs Summary:` and `Now:`
sections. Those count the change folders and the state of each task from
the current marker files alone. ADR 022 says a feature reads only through
the storage read model, so the storage kernel first gains a reader for
the files those counts need. Then the report feature gains a `report`
command that prints TypeScript's text, or with `--json` the same members
of TypeScript's JSON object. The expected results come from TypeScript
itself: goldens printed by the built `dist` on fixture projects in this
change folder, which task 2 copies into the crate.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves the storage reader reads each marker as
TypeScript's `readChangeFolder` does, that Rust `report` gives
TypeScript's text and JSON byte for byte on every golden case, and that
`osq query` still behaves as before.

## Non-goals

- The `History:` section and every later section of the report; later queue items port them.
- `--since` and `--until`; Rust `report` refuses them as unexpected arguments.
- The legacy `specs/` layout TypeScript falls back to when a project has no `openspec/changes/` and no archive; Rust reads only `openspec/changes/`.
- A configurable `paths.openspecRoot`; Rust storage reads `openspec/` as every other Rust feature does.
- The SQLite stream index TypeScript's report refreshes as a side effect; Rust `report` writes no file.

## Surface

- Added: `osq-rs report [--json]` (command).

## Decisions

- ADR 022: `report` reads the change folders only through storage's listing and the new `read_now_facts` reader, and reads config and git only through the config and vcs kernels; it calls no other feature.
- ADR 023: the status rule, the counts, the completion rate and both output forms are pure functions; one orchestrator loads the config, asks git and reads the folders.
- ADR 024: every public item ends its doc with `Implements: rust-storage/<requirement>` or `Implements: rust-report/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: the reader reads today's `.run` markers as TypeScript writes them; nothing on disk changes.
- ADR 026: a done marker's frontmatter is read only through rust-specs `parse_frontmatter`, as rust-storage "One frontmatter reader" requires.
- ADR 027: no scheduling changes.
- ADR 028: `ReportFeature` stays a unit struct with no storage connection and lists one more `Command`.
- ADR 029: `report` reads `osq.toml` through `load_config` only for its vcs block and timeouts, and adds no key.

## Assumptions

- A change folder whose `proposal.md` exists but is a folder, which TypeScript fails to read and so counts every task pending, counts its tasks by their markers in Rust. No osq command writes such a folder.
- With git on, `report` lists the trees as rust-show "Show git state" decides git is on: only when the git root is the project root itself. TypeScript's `selectVcs` makes the same choice.
- Every golden was printed by `golden/print-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-23. The worktree scenario's counts were worked out by hand from TypeScript's `listChanges` and `buildMetricsReport` rules, since `dist` would need a git repository to print them.

## Contract

### Requirement: Report summary

See `specs/rust-report/spec.md`, with "Report feature", "Query arguments",
"Report arguments", "Report changes" and "Report counts", and
`specs/rust-storage/spec.md` "Now facts".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Now facts".
- `specs/rust-report/spec.md`: MODIFIED "Report feature" and "Query arguments"; ADDED "Report arguments", "Report changes", "Report counts" and "Report summary".
- `fixture/` holds the fixture projects, and `golden/` the goldens, that task 2 copies to `crates/features/report/tests/fixtures/summary/`.
- No file is shared between tasks. Task 2 depends on task 1's reader.
