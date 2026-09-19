---
title: "Artifact integrity and failure retention: control-character and fused-line linting, dead marker retention, manual done, and warning cleanup"
depends_on:
  - "028"
verify: "pnpm verify"
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
    - metrics-and-reporting
---
## Goal

The artifacts the executor receives are what the planner wrote, and every failure leaves its diagnostics behind:

1. **Artifact Integrity and Mangled Spec Rejection**:
   - `osq lint` and `osq approve` reject any change folder file containing control characters other than newline (`\n`) and tab (`\t`).
   - `osq lint` and `osq approve` reject any task file where two or more acceptance lines share a line.
   - `approve` runs lint, guaranteeing mangled files cannot be approved.
   - `PLANNER.md` and the managed initialization template gain the instruction: "Write files with the file tool, never through a shell echo."
   - The obsolete "title contains ' and '" warning is deleted from the linter.

2. **Failure Diagnostic Retention**:
   - `dead/<n>.md` survives change re-approval. When a change is re-approved with prior dead markers, `dead/<n>.md` is renamed to `dead/<n>.<attempt>.md`, with `<attempt>` derived from existing files.
   - Nothing deletes a marker under `.run/` except `osq retry`, and retry renames. The runner's deletion of `dead/<n>.md` on task success is eliminated.

3. **Manual Task Completion and Auditability**:
   - `osq done <id> <n> --manual "<reason>"` is the sole mechanism for a human to mark a task done.
   - It writes `.run/done/<n>` with YAML frontmatter declaring `manual: true` and the reason, and appends a `done_manual` event.
   - `doctor` reports any done marker placed by hand lacking valid frontmatter.
   - Archive-time verification continues to execute the task's `verify` command regardless of manual completion.
   - `osq report` counts manual completions separately from verified ones in terminal and JSON outputs.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Control characters in change files | `osq lint` and `osq approve` fail reporting prohibited control characters for any file in the change folder containing ASCII control characters other than `\n` and `\t` (e.g. bell `\x07`) |
| Fused acceptance lines in tasks | `osq lint` and `osq approve` fail reporting fused acceptance lines when a single line contains more than one checkbox pattern (`[-*]\s*\[[ xX]\]`) |
| Title with " and " | `osq lint` accepts task titles containing `" and "` without emitting a warning |
| Spec re-approval with prior failure | `osq approve` renames existing `dead/<n>.md` to `dead/<n>.<attempt>.md`, preserving failure diagnostics and allowing the new attempt to run |
| Task runner success | Runner writes `done/<n>` without unlinking `dead/<n>.md` or any existing markers |
| Manual done CLI (`osq done`) | `osq done <id> <n> --manual "<reason>"` writes `.run/done/<n>` with `manual: true` and `reason` in frontmatter, appends a `done_manual` event, and ticks the task checkbox |
| Doctor done marker check | `osq doctor` validates that every `.run/done/<n>` marker has valid frontmatter (either automated with `scope_hash` or manual with `manual: true`); reports hand-placed markers lacking frontmatter |
| Archive-time verification | `checkAndArchiveSpec` re-executes task `verify` for every task, including tasks marked done manually |
| Metrics reporting (`osq report`) | `osq report` distinguishes verified done tasks from manual done tasks in summary tables and JSON payloads |

### Requirements and Scenarios

#### Requirement: Prohibited control characters linting
The linter SHALL reject any file within a change folder containing control characters other than newline (`\n`, `0x0A`) and tab (`\t`, `0x09`).
- **WHEN** any file in a change folder contains prohibited ASCII control characters (such as `\x07` bell)
- **THEN** `osq lint` and `osq approve` reject the change folder with a validation error

#### Requirement: Fused acceptance lines linting
The linter SHALL reject any task file where two or more acceptance checkbox items appear on the same line.
- **WHEN** a task file contains a line matching multiple acceptance checklist markers
- **THEN** `osq lint` and `osq approve` reject the task file with a validation error

#### Requirement: Dead marker retention across re-approval
When approving a change folder containing existing dead markers, `osq approve` SHALL rename `dead/<n>.md` to `dead/<n>.<attempt>.md` based on existing attempt numbers, preserving all failure diagnostics.
- **WHEN** `osq approve` executes on a change containing `.run/dead/<n>.md`
- **THEN** the marker is renamed to `.run/dead/<n>.<attempt>.md` and preserved alongside new execution markers

#### Requirement: Manual task completion
The CLI SHALL provide `osq done <id> <n> --manual "<reason>"` as the sole mechanism for human task completion, writing frontmatter metadata and recording a `done_manual` event.
- **WHEN** `osq done <id> <n> --manual "<reason>"` is executed
- **THEN** system writes `.run/done/<n>` with `manual: true` and `reason` in frontmatter, and appends a `done_manual` event to `.run/events/<n>.jsonl`

#### Requirement: Hand-placed done marker detection
The doctor subsystem SHALL inspect done markers and report any marker lacking valid automated or manual frontmatter.
- **WHEN** a done marker under `.run/done/` lacks valid YAML frontmatter
- **THEN** `osq doctor` reports a failure identifying the unverified hand-placed marker

#### Requirement: Separate manual completion accounting
The metrics and reporting subsystem SHALL track and display manual completions separately from verified completions.
- **WHEN** `osq report` runs across changes containing manually completed tasks
- **THEN** output reports counts for both verified and manual task completions

## Non-goals

- Implementing the full `osq retry` command (which remains reserved for a dedicated change).
- Allowing manually marked done tasks to skip archive-time verification.
- Modifying agent harness spawning or prompt generation protocols.

## Human steps

None.

## Delta

This change adds control-character and fused-line linting and removes the task title warning in `spec-lint-and-approve`; enforces dead marker retention across re-approval and execution in `watcher-and-harness` and `spec-lint-and-approve`; implements `osq done --manual`, planner file-tool instructions, and doctor done-marker validation in `cli-foundation`; and adds separate verified vs. manual task metrics accounting in `metrics-and-reporting`.
