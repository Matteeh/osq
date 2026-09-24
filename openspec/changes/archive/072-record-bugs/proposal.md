---
title: Record bugs from the ts-paas run
depends_on: []
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - metrics-and-reporting
    - web-inspection
    - cli-foundation
---
## Goal

Four things in osq's record are wrong today. After this change, brief to
approval runs from when the change folder was created, a change that was never
approved carries no approval time, a task's scope size counts the files it
created, and the repository record in the plan prompt prints counts instead of
bare rates. Nothing archived is rewritten; readers stop trusting what is wrong
in older records.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests prove that the
manifest `osq plan` writes carries a marked creation time and no `approvedAt`,
that approval and reapproval keep that creation time, that a manifest
`approvedAt` without `.run/approved` reaches no reader, that brief to approval
runs from the marked creation time and is not reported without it, that a task's
size counts the files its end `measures` event lists, and that the repository
record prints `First-attempt passes: <passed>/<measured>`.

## Non-goals

- Skipping the rejected folder in the watcher and in bare `osq lint`; change 071
  did that.
- Rewriting archived manifests, events, or briefs.
- Changing the brief's `date` field, or the dashboard's use of it as the created
  time.
- Changing how the planning-session window in `osq approve` uses
  `resolveChangeCreationTime`.

## Surface

- Added: `createdAtSource` in `.run/manifest.json` (manifest field)
- Changed: `approvedAt` in `.run/manifest.json` is absent until `osq approve` writes it (manifest field)
- Changed: a cycle phase no archived change covers prints `not reported` in `osq report` text (report text)
- Changed: brief to approval in `osq report` runs from the manifest's marked creation time and is null without it (report field)
- Changed: task scope sizes in `osq report` and the plan prompt's repository record include files the task created (report field)
- Changed: the plan prompt's repository record prints `First-attempt passes: <passed>/<measured>` instead of `First-attempt pass rate: <rate>` (prompt text)
- Removed: `firstAttemptPassRate` from `RepositoryRecord`, replaced by `firstAttemptPasses` (exported type field)

## Background

`writeBriefAndManifest` in `src/cli/plan-queue.ts` calls `buildManifest` in
`src/core/run/manifest.ts` without approval flags, and `buildManifest` always
sets `approvedAt` to the current time. So every change carries an approval time
from the moment `osq plan` creates it. `osq approve` calls `buildManifest` again
with its flags and overwrites the manifest, and `resolveCreatedAt` returns the
proposal's modification time, so after approval `createdAt` is the last proposal
edit. On ts-paas, 002's manifest says `createdAt` 08:47:10 while its planning
started at 08:34:59.

Approval state comes from `.run/approved`, which only `osq approve` writes.
Archived changes keep it: every archived manifest in osq (44) and ts-paas (13)
sits beside `.run/approved`. The manifest's `approvedAt` has four readers:
`readApprovedAt` in `src/watcher/auto-retry.ts`, `readManifestMetadata` in
`src/core/web/web-data-lifecycle.ts`, `readApprovedAtMs` in
`src/core/report/report.ts`, and `manifestApproval` in
`src/core/report/planning-slice-lookup.ts`. The rejected-folder path of that
lookup reads `.run/rejected.md`, not the manifest, so 066's rejection-time
boundary is unaffected.

The report's cycle phase for brief to approval reads the brief's
`date: YYYY-MM-DD` through `readBriefDateMs` as UTC midnight.

The `measures` start event's `scopeFiles` counts files the scope resolves to
before the agent runs. `gatherEndMeasures` in `src/watcher/measures.ts` lists
every file present before or after the attempt in `scopeHashes`, with a null
`before` for created files. On ts-paas, both tasks of 002 recorded
`scopeFiles: 0` while their end events list five and three created files.
`deriveMeasuredTask` in `report.ts` feeds the buckets, the largest first-attempt
pass, and the repository record from one `scopeFiles` value.

Measured in a scratch worktree with a rough version of all three tasks: the
tests that pin old values are `tests/planning-slice.test.ts` and
`tests/planning-slice-archive.test.ts` (manifests with `approvedAt` but no
`.run/approved`), `tests/report-cycle.test.ts`, `tests/report-sizes.test.ts`,
`tests/plan.test.ts`, and `tests/report-json.test.ts` through
`fixture/report/expected.json` (archived fixture manifests without
`.run/approved`). No typecheck, budget, import graph, or lint fallout.
Replacing an unmarked existing `createdAt` broke reapproval session matching in
`tests/planning-observed-approve.test.ts`, which is why an existing `createdAt`
is kept even without the marker.

`report.ts` is 1,912 lines and on the line-budget allow list, so the scope-size
rule and the brief-to-approval rule live in their own modules.

## Contract

### Requirement: Manifest creation time
The manifest SHALL keep an existing `createdAt`, and otherwise record the
folder's birth time, then the current time. It SHALL write `createdAtSource:
"created"` only when that time is the creation time, and only `osq approve`
SHALL write `approvedAt`.

#### Scenario: Plan then approve twice
- **WHEN** `osq plan` creates a change and `osq approve` runs, then runs again after an amendment
- **THEN** `createdAt` and its marker never change, and `approvedAt` first appears at the first approval

### Requirement: Trusted approval time
A manifest `approvedAt` SHALL count only when the change has `.run/approved`.

#### Scenario: Rejected without approval
- **WHEN** a change with a plan-time `approvedAt` and no `.run/approved` is read
- **THEN** automatic retry, the dashboard, the report, and planning turn attribution all treat it as never approved

### Requirement: Measured record
Brief to approval SHALL run from a marked `createdAt` to a trusted `approvedAt`.
A task's scope size SHALL be the file count of its last end `measures` event's
`scopeHashes`, else its start `scopeFiles`. The repository record SHALL print
first-attempt passes as a count over measured tasks.

#### Scenario: Created files
- **WHEN** a task's start event says `scopeFiles: 0` and its end event lists five created files
- **THEN** the report and repository record size it 5

## Human steps

- Review the proposal, delta specs, and task bodies, then run `osq approve 072`
  yourself.

## Delta

- `specs/watcher-and-harness/spec.md`: modifies "Run manifest at approval".
- `specs/metrics-and-reporting/spec.md`: modifies "Manifest and measures
  schema", "Archived change cycle metrics", "Repository task-size outcome
  history", and "Planning turn attribution"; adds "Trusted manifest approval
  time".

Three tasks; no file is shared. Task 3 imports `readManifestApprovedAt` from
task 2's `src/core/run/manifest-approval.ts` and reads task 1's
`createdAtSource`, so the tasks run in order.
