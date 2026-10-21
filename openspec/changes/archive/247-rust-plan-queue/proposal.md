---
title: The plan feature reads openspec/queue.md and lists each item with its state, as osq queue does
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: ["rust-core", "rust-storage"]
---
## Goal

Planning starts from the queue. `crates/features/plan` is a placeholder.
This change gives it the read half of `osq plan --next`: `PlanFeature`
implements core's `Feature` with one command, `queue`, which parses
`openspec/queue.md` as TypeScript's `parseQueue` does, item hash included,
finds each item's change folders through their `brief.md`, and prints what
`formatQueue` prints: each item's slug, title, state, change, rejection
count, unmet dependencies and the "changed since planned" flag.

Task 1 builds the feature, the parser with every refusal TypeScript gives,
and the text for items with no change folder, which needs no crate
dependency. Task 2 adds the storage read, the item hash and the states, and
proves parity on a golden fixture whose text TypeScript printed once.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the plan feature's tests on repositories each test builds under
`CARGO_TARGET_TMPDIR`, the golden test that compares the printed queue of
the golden fixture with the text TypeScript printed for it, and the corpus
test that reads this repository's queue.

## Non-goals

- Creating change folders, writing `brief.md`, or starting a planner; that is the next queue item, `rust-plan-new`.
- `--json`, the dashboard, CLI wiring, and `osq queue approve`.
- The queue approval line and each item's approval words, which `osq queue` adds when `openspec/.run/` holds a queue approval; they come with the Rust queue approve.
- The `archived` state, which TypeScript gives only with `vcs.enabled` and a git check of the default branch: Rust reads no `osq.toml` yet, so an archived item is `landed`, as TypeScript says under `DEFAULT_CONFIG`.
- Worktrees and stacked trees: only the project root's `openspec/changes/` is read, as TypeScript does under `DEFAULT_CONFIG`.
- Changing the TypeScript queue.

## Surface

None

## Decisions

- ADR 022: `osq-feature-plan` depends only on `osq-core`, `osq-kernel-storage` and `sha2`; change folders and their status come only from storage's `list_changes` and `read_change`. The feature reads `openspec/queue.md` and each change's `brief.md` itself, since both are the plan feature's own files: `osq plan --next` writes `brief.md` from the queue.
- ADR 023: parsing, the association, the state choice and the text are pure private functions; `PlanFeature::run` and one orchestrator alone do IO.
- ADR 024: every public function's doc and every function that implements a requirement ends with `Implements: rust-plan/<requirement>`, and every test names `Covers: rust-plan/<scenario>`.
- ADR 025: `openspec/queue.md`, `brief.md` and the change folders are read as they are today, and nothing is written; with no `osq.toml`, the queue behaves as TypeScript does under `DEFAULT_CONFIG`.
- ADR 026: brief frontmatter is read only through storage's `frontmatter_string`, which parses with the specs kernel's `parse_frontmatter`.
- ADR 027: the feature decides nothing about scheduling.
- ADR 028: the crate's one public item is `PlanFeature`, a unit struct implementing `Feature` with the name `plan` and one command `queue`, opening storage inside each `run`.

## Assumptions

- Task status comes from core's fold over the event files, as `read_change` gives it; TypeScript derives it from marker files. They agree whenever the watcher wrote both, as it does, and the golden fixture holds both. A running task therefore shows as running in Rust only through its `started` event, which the states test builds; `.run/running/` is gitignored, so the golden fixture has no running item.
- Reading `brief.md` and `openspec/queue.md` in the plan crate, not through new storage functions, is within ADR 022, since the plan feature writes both. The alternative, adding the brief's queue fields to storage's `ChangeSnapshot`, would edit the storage files 244 (`rust-inbox-feature`) is running in.
- `Cargo.lock` is shared with every other change that adds a crate dependency, such as 243 and 244; only task 2 scopes it, so task 1 can run beside them.

## Contract

### Requirement: Plan feature

See `specs/rust-plan/spec.md`.

### Requirement: Queue arguments

See `specs/rust-plan/spec.md`.

### Requirement: Queue items

See `specs/rust-plan/spec.md`.

### Requirement: Queue refusals

See `specs/rust-plan/spec.md`.

### Requirement: Queue text

See `specs/rust-plan/spec.md`.

### Requirement: Queue item hash

See `specs/rust-plan/spec.md`.

### Requirement: Queue associations

See `specs/rust-plan/spec.md`.

### Requirement: Queue states

See `specs/rust-plan/spec.md`.

### Requirement: TypeScript queue parity

See `specs/rust-plan/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-plan/spec.md`: ADDED "Plan feature", "Queue arguments", "Queue items", "Queue refusals", "Queue text", "Queue item hash", "Queue associations", "Queue states" and "TypeScript queue parity".

The change folder holds the inputs task 2 copies byte for byte:
`fixture/golden/` is the golden fixture repository and `golden/queue.txt`
the text TypeScript's `formatQueue(await projectQueue(root, DEFAULT_CONFIG))`
printed for it, followed by one newline.

Tasks 1 and 2 share `crates/features/plan/src/queue.rs`,
`crates/features/plan/src/queue/parse.rs` and
`crates/features/plan/src/queue/text.rs`; task 2 runs after task 1 and
extends all three.
