---
title: The plan feature creates the next change folder from the queue, as osq plan --next does before it starts the planner
depends_on: ["247"]
verify: sh scripts/verify-rust.sh
features:
  reads: ["rust-core", "rust-storage", "rust-specs"]
---
## Goal

`osq plan --next` is deterministic up to the moment a planner starts: pick
the next queue item, number the change, write the folder and the prompt, and
print the handoff. 247 gave the plan feature the parsed queue and each
item's state. This change adds a second command, `plan --next [--replan]`,
that does the rest of that deterministic part in Rust, as TypeScript does
under `DEFAULT_CONFIG`, so the run feature can later hand the folder to a
planner.

Task 1 adds the command: the arguments, the refusals `prepareQueuePlan`
gives, the change number, the folder's `brief.md`, `proposal.md`,
`tasks.md` and `tasks/1.md`, and the handoff text. `PlanFeature` gains a
fixed clock for the brief's date, as `InboxFeature` has one. Task 2 adds
`plan-prompt.md`, built as `buildBaseOpeningPrompt` builds it, and proves
parity on a golden fixture whose output TypeScript wrote once.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the plan feature's tests on repositories each test builds under
`CARGO_TARGET_TMPDIR` and the golden test that compares the folder and the
handoff `plan` gives on the golden fixture with what TypeScript wrote for
it.

## Non-goals

- Starting the planner, `--session`, `--print`, `--run`, steering, scratch worktrees, and planning a named change or a brief file.
- Numbering across worktrees and `osq/` branches; it comes when Rust reads them.
- The queue planning budget (`queue.maxPlanningSessions` and `queue.maxPlanningCost`), which needs `osq.toml` and planning records; Rust chooses as `prepareQueuePlan` does with `enforceBudget` off.
- `.run/manifest.json`, which records the harness, the model and the osq version from config; the approve path builds it.
- The prompt's report sections: `## This repository's record`, `## What history says`, `## Recent executor disclosures` and the manual edits notice. They are report computations over the read model and come in their own queue item; until then Rust's `plan-prompt.md` ends with `## Brief`.
- The `After land:` header line and any other config-dependent text; with no `osq.toml`, Rust writes what TypeScript writes under `DEFAULT_CONFIG`.
- The legacy `openspec/changes/_template` layout, and CLI wiring.

## Surface

None

## Decisions

- ADR 022: the plan feature reads change folders only through storage's `list_changes`, `read_change` and `frontmatter_string`, and ADRs only through the specs kernel's `read_decisions`; it reads and writes `openspec/queue.md`, `brief.md`, `proposal.md`, the task templates and `plan-prompt.md` itself, since they are the plan feature's own files.
- ADR 023: choosing the item, the failure order, the change number, the template texts, the date, the handoff and the prompt are pure private functions; `PlanFeature::run` and one orchestrator per command alone do IO, and the system clock is read only when no fixed time was given.
- ADR 024: every public function's doc and every function that implements a requirement ends with `Implements: rust-plan/<requirement>`, and every test names `Covers: rust-plan/<scenario>`.
- ADR 025: the new folder is the one today's TypeScript writes, without its `.run/manifest.json`, and with no `osq.toml` the command behaves as TypeScript does under `DEFAULT_CONFIG`.
- ADR 026: frontmatter is read only through storage's `frontmatter_string` and ADRs through `read_decisions`, both on the specs kernel's parser.
- ADR 027: the feature decides nothing about scheduling.
- ADR 028: the crate's one public item stays `PlanFeature`, now a `Copy` struct with an optional fixed time like `InboxFeature`, with the commands `queue` and `plan`.

## Assumptions

- The brief's date is the UTC date of the current time, as TypeScript's `new Date().toISOString()` gives it; `PlanFeature::at` fixes the time for tests, as `InboxFeature::at` does.
- A queue item's brief body never starts with a `---` line and its title is a plain YAML string. TypeScript would merge such a body's frontmatter into the brief and would read a non-string title differently; Rust writes the body as it is and takes the title through `frontmatter_string`.
- The active failures come from storage's marker facts (`change_regressed` and each task's `markers` and `done`), which TypeScript's `deriveSpecState` reads from the same marker files.
- Capability folders are sorted by name in byte order, which equals TypeScript's `localeCompare` for names of lowercase letters, digits and hyphens, the only names capability folders have.
- Turning `PlanFeature` into a struct breaks the unit-struct expression `PlanFeature` in 247's five test files, so task 1 changes them to `PlanFeature::new()`, and changes the unknown-command row of "Queue argument errors" from `plan` to `planx`, since `plan` is now a command.
- Task 1's scope globs `src/*.rs`, `src/next/*.rs` and `tests/plan_*.rs`; task 2's tests are named `prompt_sections.rs` and `golden_folder.rs` so the test glob does not take them.
- `Cargo.lock` is shared with every other change that adds a crate dependency; only task 2 scopes it.
- 248 showed that the watcher's archiver ticks every nested `tasks.md` in a change folder, which changes its seal (queued as `archive-keeps-seal`). This change folder therefore holds no file named `tasks.md`: the golden `tasks.md` is stored as `golden/005-beta/tasks-md.txt`, and task 2 copies it to the crate under its real name.

## Contract

### Requirement: Plan feature

See `specs/rust-plan/spec.md`.

### Requirement: Queue arguments

See `specs/rust-plan/spec.md`.

### Requirement: Plan arguments

See `specs/rust-plan/spec.md`.

### Requirement: Next queue item

See `specs/rust-plan/spec.md`.

### Requirement: Next change number

See `specs/rust-plan/spec.md`.

### Requirement: Change folder files

See `specs/rust-plan/spec.md`.

### Requirement: Plan handoff

See `specs/rust-plan/spec.md`.

### Requirement: Plan prompt

See `specs/rust-plan/spec.md`.

### Requirement: TypeScript plan parity

See `specs/rust-plan/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-plan/spec.md`: MODIFIED "Plan feature" and "Queue arguments"; ADDED "Plan arguments", "Next queue item", "Next change number", "Change folder files", "Plan handoff", "Plan prompt" and "TypeScript plan parity".

The change folder holds the inputs task 2 copies byte for byte:
`fixture/golden/` is the golden fixture repository; `golden/005-beta/` is
the folder TypeScript's `createQueueChange` wrote for it on 2026-10-21, with
`plan-prompt.md` from `buildBaseOpeningPrompt` and without `.run/`, its
`tasks.md` stored as `tasks-md.txt`; and `golden/handoff.txt` is the
handoff `formatPlanHandoff` gave, with the repository path written `<root>`.

Tasks 1 and 2 share `crates/features/plan/src/next.rs`, which task 2
extends to write the prompt, and `crates/features/plan/src/next/prompt.rs`,
which task 2 creates inside task 1's `src/next/*.rs` glob; task 2 runs
after task 1.
