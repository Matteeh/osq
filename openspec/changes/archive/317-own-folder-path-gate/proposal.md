---
title: A task that writes its own change folder's name outside openspec dies before it is done
depends_on: []
verify: pnpm verify
features:
  reads: [version-control, cli-foundation, spec-lint-and-approve, status-inspection]
---
## Goal

A change's folder moves from `openspec/changes/<folder>` to
`openspec/changes/archive/<folder>` when it archives. A test that
hard-codes the active path passes while the change runs and breaks the
default branch the moment it lands, so the next approved changes die as
`baseline_red`. It happened with 302 (fixed by hand in ba515f72), with
308 (e8339c7a, whose red tree killed 309 and 310 on 2026-10-23), and
again with 315's `tests/vcs-root-refusal.test.ts`, which is red on main
as this plan is written. `osq lint` cannot catch it, because it runs
before the tests exist.

This change adds a watcher gate. After a task's verify passes, the
watcher reads every scope file the task changed outside `openspec/`.
When one names the change's own folder outside a `//` or `/* */`
comment, the task dies with the new reason `own_folder_path`. Its marker
names each file and line and says to reach the change folder through
`OSQ_CHANGE`. The reason is eligible for an automatic retry, so the next
attempt sees the marker and can fix the path.

## Verify

`pnpm verify` runs both typechecks, the build, every test and lint. It
proves the comment and name rules on a table of texts, that `runTask`
kills a task whose new test file names its own folder with the exact
marker and lets the same file pass with the name in a comment or with
another change's name, and that every earlier watcher test still holds.

## Non-goals

- Planning-time lint; the files do not exist yet.
- The Rust run feature; the gate is ported with the Rust loop.
- Removing duplicate scenario names from living specs.
- Comment syntaxes other than `//` and `/* */`.

## Surface

- Added: `own_folder_path` (dead reason), eligible for automatic retry

## Decisions

- ADR 002: archive's delta merge is unchanged; the gate exists because archive moves the folder.
- ADR 006: the gate is a deterministic watcher check that blocks, not a planner habit.
- ADR 010: the validator is unchanged.
- ADR 012: the gate runs inside a task's attempt, so the supervisor is unchanged.
- ADR 018: the steering planner is unchanged; `own_folder_path` is a dead reason, not a steering trigger.
- ADR 019: tapped planners are unchanged.
- ADR 021: autopilot's recovery retries `own_folder_path` like any eligible reason.

## Assumptions

- The gate matches the bare folder name, as the brief asks, not only paths. A task that uses its own folder name as sample data dies once; 204-rust-core's `Change::draft("204-rust-core", ...)` tests would have. The automatic retry's prompt shows the marker, so the executor can switch to another id.
- `tests/vcs-stacked-land.test.ts` changes: its fake adapter writes `<folder> task <n>` into scope files, which the gate kills. It now writes `<id> task <n>`, using the change's leading number. A rough version of this change, measured on 2026-10-23, broke no other test.
- Main must be green before this change starts; see Human steps.

## Contract

### Requirement: Own folder name gate

See `specs/watcher-and-harness/spec.md`, "Own folder name gate", and
"Automatic retry", whose eligible list gains `own_folder_path` and now
names `provider_unavailable`, which the code already retries.

## Human steps

### Before approval

- Make main green first. `tests/vcs-root-refusal.test.ts`, from 315, copies `openspec/changes/315-vcs-root-fails-fast/specs/cli-foundation/spec.md`, which archive moved, so its cli-foundation lookup fails on main and every approved change dies `baseline_red`. Fix it through osq before approving this change.

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: ADDED "Own folder name gate"; MODIFIED "Automatic retry", with its scenarios unchanged.
- No file is shared by two tasks.
