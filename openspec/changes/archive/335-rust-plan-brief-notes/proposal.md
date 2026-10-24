---
title: Rust osq plan takes --brief, --notes and --print
depends_on: []
verify: cargo test -p osq-feature-plan
features:
  reads: [rust-core, rust-config, rust-specs, rust-storage, rust-vcs]
---
## Goal

Rust `osq plan` plans the next queue item and writes a steering prompt, but
it refuses every other flag. TypeScript's `osq plan` also starts a new
change from a brief file or standard input with `<name> --brief <file|->`,
prints the prompt for a planner the human starts themselves with
`--print`, and refuses each combination it does not take with its own
message. This change ports those three to the plan crate, so the files the
plan crate writes and the text it prints equal TypeScript's.

TypeScript's `--notes` works only with `--run`, which starts a planner
process and is a non-goal here. So Rust `plan` gives TypeScript's refusal
for `--notes`, `` `--notes` is valid only with `--run` ``, and passes no notes
to any planner.

## Verify

`cargo test -p osq-feature-plan` runs every plan crate test. It proves the
new argument grammar and each TypeScript refusal, `--print` for the next
queue item and for a steering prompt, a new change from a brief file and
from standard input equal byte for byte to the folder and handoff
TypeScript's `dist` wrote for the plan fixture, the brief texts, the
finished and number refusals TypeScript gives, and the change names. The
watcher also runs cargo-mutants on the touched lines.

## Non-goals

- `--run` and `--session`, which start a planner process; Rust refuses them as unknown flags.
- Passing `--notes` to a planner; TypeScript does that only with `--run`.
- An editor for the brief when `--brief` is missing; a name without `--brief` stays the steering id it is today.
- `--next <slug>`; Rust reads an argument after `--next` as a change name and refuses it.
- Reopening an active change that needs no steering, which TypeScript does when its folder holds a `brief.md`; Rust keeps the steering refusal.
- TypeScript's `.run/manifest.json`, which the Rust queue path does not write either.

## Surface

- Added: Rust `osq plan --print` and `-p` (flag).
- Added: Rust `osq plan <name> --brief <file|->` (flag).
- Added: Rust `osq plan --notes <text>`, refused as TypeScript refuses it without `--run` (flag).
- Changed: Rust `osq plan` gives TypeScript's messages for `--next` with a name or `--brief`, `--replan` without `--next`, and no name.

## Decisions

- ADR 022: the plan crate reads changes through rust-storage, frontmatter through rust-specs and the default branch through rust-vcs, and calls no other feature.
- ADR 023: argument reading, slugs and the brief text are pure functions; `run_new` is the one orchestrator that reads the brief and writes the folder.
- ADR 024: every function ends its doc with `Implements: rust-plan/<requirement>`, and each test names `Covers: rust-plan/<scenario>`.
- ADR 025: the new folder's files are TypeScript's bytes; `brief.md` keeps TypeScript's frontmatter order.
- ADR 026: the brief's frontmatter is read with rust-specs `parse_frontmatter`, never with the Node openspec CLI.
- ADR 027: no scheduling changes.
- ADR 028: `PlanFeature` stays a `Copy` struct with two commands; only the `plan` usage text changes.
- ADR 029: the steering candidates and `vcs.enabled` come from `load_config`; no key is added.

## Assumptions

- The goldens were printed by `golden/print-goldens.mjs.txt` with this repository's built `dist` on 2026-10-24, the UTC date of `PlanFeature::at(1792843200000)`, and the refusal and brief text rows were checked against the same `dist`.
- The `landed` refusal row follows TypeScript's `readDependencyState`, which calls an archived change landed when the default branch holds its archive folder; it was not run against TypeScript, which needs an `osq.config.ts` for vcs.
- A brief's frontmatter values are strings, numbers, booleans or null; TypeScript writes a list or a map as `String` gives it, which Rust does not copy.
- An unreadable brief fails with `Cannot read brief <file>: <error>`, since TypeScript's message is Node's own error text.

## Contract

### Requirement: Arguments and print

See `specs/rust-plan/spec.md`: MODIFIED "Plan feature" and "Plan
arguments", and ADDED "Plan print".

### Requirement: Plan from a brief

See `specs/rust-plan/spec.md`: ADDED "Plan from a brief" and "Brief file
text".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-plan/spec.md`: MODIFIED "Plan feature" (usage) and "Plan arguments" (grammar and TypeScript refusals; the rows that now get a TypeScript message move to the new scenario "TypeScript argument refusals"); ADDED "Plan print", "Plan from a brief" and "Brief file text".
- Shared file: `crates/features/plan/src/**` is in the scope of tasks 1 and 2; task 2 runs after task 1 and extends the argument reading and the `--print` path task 1 writes.
