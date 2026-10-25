## MODIFIED Requirements

### Requirement: Report summary
`report` SHALL return the text TypeScript's `reportCommand` returns without
`--json`, byte for byte, from its first line through the last line of its
`Coverage:` section, the line before the first blank line after `Coverage:`,
with no newline at the end. The text is:
`osq Delivery Metrics Report`, a blank line, `Specs Summary:`, then
`  Total specs: <total> (<active> active, <archived> archived)`, a blank
line, `Now:`, then `  Total tasks:`, `  Done:`, `  Verified done:`,
`  Manual done:`, `  Dead:`, `  Regressed:`, `  Running:`, `  Pending:`
and `  Unmarked:`, each followed by a space and its count, then
`  Completion rate: <rate>%`, then the `History:` lines that rust-report
"Report history" gives, then the lines that rust-report "Report history
blocks" and "Report sizes" give, then, when rust-report "Report validation"
gives a section, a blank line and its lines, then a blank line and the lines
rust-report "Report coverage" gives. With `--json`, `report` SHALL return
the `completionRate`, `coverage`, `now`, `specs` and `validation` members of
TypeScript's `report --json` object, `validation` left out when "Report
validation" gives none, and its `history` member with only the
`attempts`, `cost`, `deadByReason`, `dependencies`, `disclosures`,
`preSpawnVerify`, `rejections`, `retries`, `rework`, `scopeRegressions`,
`sizes`, `unexplainedReruns` and `verifyRuns` members, of which
`dependencies`, `disclosures` and `rework` are left out when they would be
empty. They are written as `serializeSortedJson` writes them: keys in
sorted order, two-space indents, `{}` and `[]` for an empty object and an
empty array, and no newline at the end. Every number SHALL be written as
JavaScript writes a number: a whole number with no fraction, such as `0`
and `100`, and any other as its shortest decimal, such as `31.25` and
`0.7000000000000001`.

Rust reads no traceability setting, so no capability opts in, and `report`
SHALL print no `Traceability:` section and write no `traceability` member,
as TypeScript leaves them out for a project with
`traceability.capabilities` empty, its default.

#### Scenario: Report summary equals TypeScript's
- **WHEN** each row runs `report` on a fresh scratch copy of its project from `tests/fixtures/summary/`, or on a new empty scratch folder for `empty`, after writing the row's lock files into `openspec/changes/003-running/.run/running/` of the copy, once with no args and once with `--json`
- **THEN** the text equals `tests/fixtures/summary/golden/<case>.txt` and the JSON equals `tests/fixtures/summary/golden/<case>.json`, byte for byte, and the `report-project` case also gives that JSON for the args `--json`, `--json`:

| Case | Project | Lock files | Completion rate |
|---|---|---|---|
| `empty` | none | none | `0` |
| `report-project` | `report-project` | none | `31.25` |
| `report-project-running` | `report-project` | `7.pid` holding `not json\n`, `8.pid` holding `{"pid":1,"startedAt":1}\n` | `31.25` |
| `all-done` | `all-done` | none | `100` |
| `thirds` | `thirds` | none | `66.67` |
| `history-project` | `history-project` | none | `0` |
| `sizes-project` | `sizes-project` | none | `0` |
| `coverage-project` | `coverage-project` | none | `0` |

## ADDED Requirements

### Requirement: Report validation
`report` SHALL summarize the latest validator run of each archived change it
counts, as TypeScript's `collectValidation` and `formatValidation` in
`src/core/report/report-validation.ts` do, from rust-storage "Latest
validation". With no archived change holding a readable run, it SHALL give
no section and no `validation` member. Otherwise, with `<changes>` the
changes with a run, `<validated>` those whose outcome is `validated`, and
`<findings>` the sum of their findings, it SHALL give `Validation:`,
`  <validated> of <changes> changes validated, <findings> findings`, and one
line per change in folder name order, by leading number and then by bytes:
`  <folder>: <findings> findings` for a validated run, and
`  <folder>: not validated (<outcome>)` for any other. The JSON member
`validation` SHALL hold `changes`, `validated`, `findings` and `perChange`,
one `{change, outcome, findings}` object per line, in the same order, where
`findings` is 0 for a run that is not validated.

#### Scenario: Validation of the coverage project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/coverage-project`
- **THEN** the text holds, after the History section and a blank line, exactly these lines, and the JSON's `validation` holds `changes` 4, `validated` 2, `findings` 2 and the rows as `perChange`:

| Line | Change | Outcome | Findings |
|---|---|---|---|
| `Validation:` | | | |
| `  2 of 4 changes validated, 2 findings` | | | |
| `  301-validated: 2 findings` | `301-validated` | `validated` | 2 |
| `  302-timed-out: not validated (timed_out)` | `302-timed-out` | `timed_out` | 0 |
| `  310-tie: not validated (failed)` | `310-tie` | `failed` | 0 |
| `  311-findings-not-a-list: 0 findings` | `311-findings-not-a-list` | `validated` | 0 |

#### Scenario: No validation section without a run
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/sizes-project`
- **THEN** the text holds no `Validation:` line and the JSON has no `validation` member

### Requirement: Report coverage
`report` SHALL count, for every task file of every change it counts, whether
the task has an event file, as TypeScript's `buildMetricsReport` in
`src/core/report/report.ts` builds `coverage`, from rust-storage "Task event
files", and SHALL give `Coverage:`, `  Tasks with event files: <with>` and
`  Tasks without event files: <without>`. The JSON member `coverage` SHALL
hold `withEvents` and `withoutEvents`, those two counts; `byChange`, one
member per change folder holding at least one task file, named by its
folder, holding `withEvents` and `withoutEvents`, its task ids in each
group, ordered by leading number and then by bytes; and, when rust-storage
"Capability sidecars" gives a split, `capabilities` holding its
`withSidecar` and `withoutSidecar` names.

#### Scenario: Coverage of the coverage project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/coverage-project`
- **THEN** the text ends with `Coverage:`, `  Tasks with event files: 3` and `  Tasks without event files: 4`, and the JSON's `coverage` holds `withEvents` 3, `withoutEvents` 4, `capabilities` with `withSidecar` `["alpha"]` and `withoutSidecar` `["beta"]`, and `byChange` with exactly the rows:

| Change | withEvents | withoutEvents |
|---|---|---|
| `301-validated` | `["1"]` | `["2"]` |
| `302-timed-out` | `[]` | `["1"]` |
| `303-unreadable` | `[]` | `["1"]` |
| `305-active` | `["2","10"]` | `["1"]` |

#### Scenario: Coverage with no living spec
- **WHEN** a test runs `report` on a new empty scratch folder
- **THEN** the text ends with `Coverage:`, `  Tasks with event files: 0` and `  Tasks without event files: 0`, and the JSON's `coverage` is `{"byChange":{},"withEvents":0,"withoutEvents":0}` with no `capabilities` member
