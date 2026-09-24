---
title: Rework, executor disclosures and planning price estimates
depends_on: ["072", "073"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - status-inspection
    - metrics-and-reporting
---
## Goal

Three things the record misses today become visible, without changing what the
watcher does. A change that fixes another names it, the report counts rework per
change, and an approval flag's later trouble includes being fixed later. What
executors disclose in their result files is counted, shown in the inbox and
`osq show`, and fed to the next planner as labelled claims. A planning slice
with recorded tokens but no cost gets an estimate at report time from
`planning.prices`, labelled as one. This covers roadmap items 2.1, 2.4 and 2.6.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests on temp projects
prove that `fixes: ["001"]` gives 001 one rework and turns a flag on 001 into
later trouble of kind rework; that a queue `Fixes:` line reaches the new
proposal and a bad one fails parsing; that lint rejects `fixes` naming a missing
change; that the result parser tolerates heading drift and ignores `None`; that
the inbox and `osq show` mark disclosures; that the plan prompt carries
disclosures from the configured number of changes within the character budget,
under the executor-claims label, without `## Changed`, `## Next`, or `Touched:`;
that a slice with tokens and no cost gets an estimate equal to what approval
computes with the same price entry; and that doctor and approve name a missing
`planning.prices["<model>"]` key.

## Non-goals

- Recording rework on already archived changes, or editing any record.
- Judging whether a disclosure is true.
- Changing any watcher behavior, including dependency completion: `fixes` never
  blocks a change from running.
- Feeding estimates into the queue planning budget, per-change planning
  economics, or the dashboard.

## Surface

- Added: `fixes` in proposal frontmatter (frontmatter field)
- Added: `Fixes:` line in a queue item, right after `Depends on:` (queue syntax)
- Added: lint error `fixes names missing change: <id>` (lint finding)
- Added: `## Outside scope` result file heading, and reworded purposes for `## Deviated` and `## Missing context` (document section)
- Added: `planning.disclosures.recentChanges` and `planning.disclosures.maxCharacters` (config keys)
- Added: `## Recent executor disclosures` plan prompt section, present only when a disclosure exists (prompt section)
- Added: `disclosures` on an inbox landed item that disclosed anything, and a `Disclosures:` line per task in `osq show` (inbox field, show text)
- Added: `history.rework`, `history.disclosures`, `approvalFlags.troubledChanges`, and `planning.cost.bySource` in `osq report --json`, with matching text lines (report fields)
- Added: doctor check `planning-prices`, present only when a model with recorded planning tokens has no price, and an `osq approve` line naming the missing key (doctor check, approve text)

## Background

On ts-paas, 007 fired `removed_requirement` and `sensitive_path` and then needed
008 to fix it, yet `osq report` says those flags led to no trouble:
`collectApprovalFlagOutcomes` in `src/core/report/approval-flags.ts` counts
trouble only as a task `dead` or any `regressed` event. `parseSpecMd` in
`src/core/spec/parser.ts` reads `depends_on`; `seedProposal` in
`src/core/foundation/new.ts` rewrites the seeded `depends_on:` line;
`prepareQueuePlan` in `src/core/status/queue-planning.ts` resolves landed
dependencies to change ids and `createQueueChange` in `src/cli/plan-queue.ts`
passes them on. `parseSection` in `src/core/status/queue-parser.ts` requires
`Depends on:` as an item's first line. `checkDependencyExists` in
`src/core/spec/linter.ts` already looks in active, archived, and rejected
folders.

Result files use `RESULT_HEADINGS` in `src/core/foundation/init-blocks.ts`, and
nothing in `src/` parses them. On ts-paas, every gap surfaced in a result file
and none as a dead task; 006's executor filed a deviation under missing context
and 004 wrote `## Touched:` as a heading. The inbox's landed group comes from
`collectLandedItems` in `src/core/status/inbox.ts`; its JSON contract adds a
field only where it applies, as `stuck` does. `osq show` already prints each
task's whole result file. `buildOpeningPrompt` in `src/cli/plan.ts` appends the
repository record as the fifth prompt section.

`planning.prices` in `src/core/foundation/config-planning.ts` is applied only at
approval, through `resolveSliceCost` in
`src/core/report/planning-slice-measures.ts`, which records
`costSource: 'price_table'` and puts the cost in the exit's `usage.cost`. On
ts-paas every recorded slice has tokens and a null cost. A recorded slice keeps
summed tokens with cache reads and writes apart, and the session's
`plan_started` record names the model. Pricing is linear, so calling
`resolveSliceCost` with one turn carrying the slice's summed tokens and that
model gives approval's number for a single-model session. The report's planning
section labels every `usage.cost` as harness-reported today, including costs
priced at approval.

`report.ts` is 1,912 lines and on the line-budget allow list, and
`toStableMetrics` in `src/cli/report.ts` copies report fields by name, so every
new report field is wired there too. `doctor.ts` is 241 lines, so the price
check lives in its own module.

Measured in a scratch worktree with rough versions of the shape changes: the
tests that pin changed shapes are `tests/managed-blocks.test.ts` and
`tests/fixtures/prompts/` (result headings), `tests/config-planning.test.ts`
(planning defaults), and `tests/report-json.test.ts` with
`fixture/report/expected.json` (report keys). A doctor check or prompt section
that always appears also broke `tests/doctor.test.ts`,
`tests/pi/doctor.test.ts`, `tests/codex/adapter.test.ts`, and
`tests/plan.test.ts`, and an always-present inbox field broke
`tests/inbox.test.ts` and `tests/ui-home.test.tsx`; all three appear only when
they apply, which leaves those tests alone. The new `SpecData` and `QueueItem`
fields cause no typecheck fallout.

## Contract

### Requirement: Rework
A change MAY name the changes it fixes in `fixes`. `osq report` SHALL count, per
change, the later non-rejected changes that name it, and a change fixed later
SHALL count as later trouble for its approval flags.

#### Scenario: Fixed change
- **WHEN** 002's proposal declares `fixes: ["001"]` and 001 recorded `sensitive_path`
- **THEN** the report shows 001 fixed by 002 and counts `sensitive_path` as later trouble of kind rework

### Requirement: Executor disclosures
Real `## Deviated`, `## Missing context`, and `## Outside scope` sections SHALL
be counted in the report, marked in the inbox and `osq show`, and quoted in the
plan prompt as unverified executor claims within a configured budget.

#### Scenario: Disclosure in the plan prompt
- **WHEN** a recent archived change's result file has an `## Outside scope` section
- **THEN** the next plan prompt quotes it under the executor-claims label and never quotes `## Changed`, `## Next`, or `Touched:`

### Requirement: Planning price estimates
A recorded slice with tokens and no cost SHALL be priced at report time with the
rule approval uses and labelled as an estimate; a missing price entry SHALL be
named exactly.

#### Scenario: Unpriced slice
- **WHEN** a slice has tokens, no cost, and `planning.prices` has an entry for its model
- **THEN** the report shows its estimate apart from harness-reported and approval-priced costs

## Human steps

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: adds "Rework declaration" and
  "Approval price gap notice".
- `specs/status-inspection/spec.md`: modifies "Read-only brief queue parsing"
  and "Stable inbox object"; adds "Task disclosure inspection".
- `specs/cli-foundation/spec.md`: modifies "Executor protocol constants and
  result headings", "Interactive planning command", and "Next queue item
  planning"; adds "Planning price diagnostics".
- `specs/metrics-and-reporting/spec.md`: modifies "Approval flag outcomes";
  adds "Result file sections", "Rework history", "Executor disclosure counts",
  "Recent executor disclosures in the plan prompt", and "Planning cost
  estimates at report time".

Six tasks; no file is shared. Tasks 3, 4, and 6 import task 2's
`src/core/report/result-sections.ts`, and task 6 reads task 1's
`SpecData.fixes`, so the tasks run in order.
