# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Result file sections
<!-- source: src/core/report/result-sections.ts, tests/result-sections.test.ts -->
One parser in `src/core/report/result-sections.ts` SHALL read a result file's
sections. A heading SHALL match regardless of case, `#` count, surrounding
spaces, and a trailing colon, so `## deviated:` is `## Deviated` and
`## Touched:` is the `Touched:` line. A section that is empty or says only
`None`, in any case and with an optional trailing period, SHALL be absent. The
real disclosure sections of a task SHALL be `## Deviated`, `## Missing context`,
and `## Outside scope`; the parser SHALL also read every task result file of a
change into per-task disclosures.

#### Scenario: Heading drift
- **WHEN** a result file holds `## deviated:` with text, `## Missing context` saying `None`, and `##  Outside Scope` with text
- **THEN** the task has a deviated and an outside-scope disclosure and no missing-context disclosure

### Requirement: Rework history
<!-- source: src/core/report/record-rework.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-record-extras.test.ts -->
`osq report` SHALL derive rework from the `fixes` of every active and archived
change, never rejected ones. `history.rework` SHALL list, for each change named
in some `fixes`, the change id and the sorted ids of the changes that fix it,
ordered by change id. Text output SHALL print a `Rework:` section with one
`<id>: fixed by <id>, <id>` line per entry, or `(none)`.

#### Scenario: One fix
- **WHEN** active change 002 declares `fixes: ["001"]`
- **THEN** `history.rework` holds `{ change: "001", fixedBy: ["002"] }` and the text prints `001: fixed by 002`

#### Scenario: Rejected fix
- **WHEN** the only change naming 001 in `fixes` was rejected
- **THEN** 001 has no rework entry

### Requirement: Executor disclosure counts
<!-- source: src/core/report/record-disclosures.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-record-extras.test.ts -->
`osq report` SHALL count, per active and archived change, the tasks whose result
files hold a real `## Deviated`, `## Missing context`, or `## Outside scope`
section. `history.disclosures` SHALL list only changes with at least one, as
`{ change, deviated, missingContext, outsideScope }` ordered by change id, and
text output SHALL print an `Executor disclosures:` section with one line per
listed change, or `(none)`.

#### Scenario: Counted disclosures
- **WHEN** one task of 003 has a real `## Deviated` and another has a real `## Outside scope`
- **THEN** `history.disclosures` holds `{ change: "003", deviated: 1, missingContext: 0, outsideScope: 1 }`

### Requirement: Recent executor disclosures in the plan prompt
<!-- source: src/core/report/recent-disclosures.ts, src/cli/plan.ts, src/core/foundation/config-planning.ts, tests/plan-disclosures.test.ts, tests/config-planning.test.ts -->
The plan prompt's `## Recent executor disclosures` section SHALL quote the real
disclosure sections of the `planning.disclosures.recentChanges` most recent
archived changes by numeric id, newest first and in task order, each as a
`<change> task <n>, <section>:` line followed by its text with every line
prefixed `> `. The section SHALL open with the sentence `Executor claims from
result files, not verified facts. Check them against the code before relying on
them.` Its quoted entries SHALL total at most
`planning.disclosures.maxCharacters` characters; the first entry that does not
fit SHALL be cut to fit and end with `[truncated]`, and no later entry SHALL be
included. It SHALL never include `## Changed`, `## Next`, `Touched:`, or diffs.
`recentChanges` and `maxCharacters` SHALL default to 3 and 4000 and be positive
integers.

#### Scenario: Budgeted disclosures
- **WHEN** the configured recent changes hold more disclosure text than `maxCharacters`
- **THEN** the quoted entries fit the budget, the last one ends with `[truncated]`, and no quoted line starts without `> `

#### Scenario: Invalid configuration
- **WHEN** `planning.disclosures.recentChanges` or `maxCharacters` is zero, negative, or not an integer
- **THEN** configuration loading fails naming the key

### Requirement: Planning cost estimates at report time
<!-- source: src/core/report/record-estimates.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-record-extras.test.ts -->
For each planning session whose recorded slice has non-null input and output
tokens and whose exit reports no cost, `osq report` SHALL estimate a cost when
`planning.prices` has an entry for the model named by the session's
`plan_started` record, by calling `resolveSliceCost` with one turn carrying the
slice's summed tokens and that model, so a single-model session gets the number
approval would have recorded. `planning.cost.bySource` SHALL report
`harness`, `approvalPrice`, and `reportEstimate`, each with `total` and
`sessions`, where `approvalPrice` holds recorded costs whose slice says
`costSource: "price_table"`, plus `totalWithEstimates`. Text output SHALL print
each source on its own labelled line and state how much of the total is
estimated. No record SHALL be written.

#### Scenario: Estimated slice
- **WHEN** a session recorded slice tokens from `claude-opus-5-5`, no cost, and `planning.prices` prices that model
- **THEN** `bySource.reportEstimate` counts that session with the same cost `resolveSliceCost` returns for those tokens, and the text labels it as estimated from `planning.prices`

#### Scenario: No price entry
- **WHEN** such a session's model has no price entry
- **THEN** it is not estimated and its cost stays unreported

## MODIFIED Requirements

### Requirement: Approval flag outcomes
<!-- source: src/core/report/approval-flags.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-approval-flags.test.ts, tests/report-record-extras.test.ts, fixture/report/** -->
`osq report` SHALL read `approvalFlags` from each active and archived change's
manifest and report, per flag id and for changes with no flag, how many changes
recorded it and how many of those later had trouble, split by `shown` and
`confirmed`. Trouble SHALL mean a `dead` event in a task stream, a `regressed`
event in a task or change stream, or a later non-rejected change naming the
change in `fixes`. `approvalFlags.troubledChanges` SHALL list each troubled
change that recorded at least one flag, with its id, its flag ids, and its
trouble kinds in the order `dead`, `regressed`, `rework`, and text output SHALL
print one line per such change after the per-flag lines. Changes without a
recorded `approvalFlags` SHALL NOT be counted, and flags SHALL NOT be
recomputed.

#### Scenario: Flag outcomes
- **WHEN** three changes recorded `shared_file`, two shown and one confirmed, and one shown change later has a `dead` event
- **THEN** `approvalFlags.byFlag.shared_file` reports shown fired 2 and troubled 1, and confirmed fired 1 and troubled 0

#### Scenario: Older changes
- **WHEN** a change's manifest has no `approvalFlags`
- **THEN** it contributes nothing to the section and `approvalFlags.changes` does not count it

#### Scenario: Rework as trouble
- **WHEN** 007 recorded `removed_requirement` and `sensitive_path`, had no dead or regressed event, and 008 declares `fixes: ["007"]`
- **THEN** both flags count 007 as troubled and `troubledChanges` lists 007 with kinds `["rework"]`
