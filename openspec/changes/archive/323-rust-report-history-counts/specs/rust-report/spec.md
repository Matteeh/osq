## MODIFIED Requirements

### Requirement: Report summary
`report` SHALL return the text TypeScript's `reportCommand` returns without
`--json`, byte for byte, from its first line through its
`    Requeued for agent:` line, with no newline at the end. The text is:
`osq Delivery Metrics Report`, a blank line, `Specs Summary:`, then
`  Total specs: <total> (<active> active, <archived> archived)`, a blank
line, `Now:`, then `  Total tasks:`, `  Done:`, `  Verified done:`,
`  Manual done:`, `  Dead:`, `  Regressed:`, `  Running:`, `  Pending:`
and `  Unmarked:`, each followed by a space and its count, then
`  Completion rate: <rate>%`, then the `History:` lines that rust-report
"Report history" gives. With `--json`, `report` SHALL return the
`completionRate`, `now` and `specs` members of TypeScript's
`report --json` object, and its `history` member with only the
`attempts`, `cost`, `deadByReason`, `preSpawnVerify`, `rejections`,
`retries`, `scopeRegressions`, `unexplainedReruns` and `verifyRuns`
members. They are written as `serializeSortedJson` writes them: keys in
sorted order, two-space indents, `{}` and `[]` for an empty object and an
empty array, and no newline at the end. Every number SHALL be written as
JavaScript writes a number: a whole number with no fraction, such as `0`
and `100`, and any other as its shortest decimal, such as `31.25` and
`0.7000000000000001`.

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

## ADDED Requirements

### Requirement: Report history
`report` SHALL count history as TypeScript's `buildMetricsReport` does. It
SHALL read `read_task_history` once for each task it counts, in the order
it counts them. Each task's id is `<change folder>/<task id>`. It SHALL
read `read_rejection_planner` once for each rejected change entry it
lists. Then:

- `attempts`: `total` is the sum of `attempts`. `byTask` maps every
  counted task's id to its `attempts`. `multipleAttempts` lists the ids
  with more than 1 attempt, sorted by bytes.
- `unexplainedReruns`: `total` is the sum of `unexplained`. `byTask` maps
  the ids with more than 0 to their count.
- `deadByReason` counts each entry of every task's `dead_reasons`.
- `verifyRuns`: `total` is the number of `verify_codes` entries, and
  `missingExitCode` the number that are `None`. `byTask` maps the ids
  with any entry to their codes, `null` for `None`.
- `preSpawnVerify`: `runs`, `mismatches` and `missingPathRuns` are sums.
  `mismatchedTasks` lists the ids with more than 0 mismatches, sorted by
  bytes. `byStart` holds `red`, `green` and `any`, each with `runs` and
  `passed` summed.
- `cost`: `total` starts at 0 and adds every task's `costs` one value at
  a time, in task order. `perSpec` adds each change folder's values the
  same way and keeps only the folders whose sum is above 0. `coverage`
  holds `reportedAttempts`, the sum of `cost_reported_attempts`, and
  `totalAttempts`, the attempts total. `provenance` is
  `harness-reported`. `formattedTotal` is the reported cost text of the
  total and `reportedAttempts`.
- `retries`: `automatic` and `manual` each hold `count`, `reachedDone`,
  `cost` and `costReportedAttempts`, summed task by task. Each task's
  group cost is added to the running sum. `stuck` is the sum of `stuck`.
- `rejections`: `total` is the number of rejected entries that give a
  planner, and `byPlannerModel` counts each planner they give.
- `scopeRegressions` holds `detected`,
  `verificationPassedAtDetection`, `verificationFailedAtDetection`,
  `recertifiedByHuman`, `recertifiedAutomatically` and
  `requeuedForAgent`, the sums of `ScopeHistory`'s fields in that order.

The text SHALL follow the `  Completion rate:` line with a blank line,
`History:`, then:

- `  Total attempts: <n>`
- `  Tasks with multiple attempts: <n>`
- `  Unexplained re-runs: <n>`
- `  Verification runs: <n>`
- `  Verification runs missing exit code: <n>`
- `  Pre-spawn verify mismatches: <mismatches> of <runs> runs`
- `  Pre-spawn verify with missing paths: <missingPathRuns> of <runs> runs`
- `  Pre-spawn verify by declared start: red <p> of <r> passed, green <p> of <r> passed, any <p> of <r> passed`
- `  Automatic retries:`
- `  automatic: <count> retries, <reachedDone> reached done, cost <text> (<costReportedAttempts> of <count> attempts reported cost)`,
  then the same line for `manual`
- `  Stuck: <n>`
- `  Harness-reported cost: <formattedTotal> (<reportedAttempts> of <totalAttempts> attempts reported cost)`
- `  Dead by reason:`, then `    <reason>: <n>` for each reason, or
  `    (none)` when there are none
- `  Rejections: <n>`
- `  Rejections by planner model:`, then `    <model>: <n>` for each
  model, or `    (none)` when there are none
- `  Scope regressions:`, then `    Detected:`,
  `    Verification passed at detection:`,
  `    Verification failed at detection:`, `    Recertified by human:`,
  `    Recertified automatically:` and `    Requeued for agent:`, each
  followed by a space and its count.

Reasons and models SHALL be listed sorted by their lowercase text, by
bytes, with ties sorted by bytes. For names of lowercase letters, digits,
`-` and `.`, that is the order JavaScript's `localeCompare` gives.

#### Scenario: History of the history project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/history-project`
- **THEN** its lines include `  Total attempts: 8`, `  Unexplained re-runs: 1`, `  Pre-spawn verify by declared start: red 1 of 2 passed, green 1 of 1 passed, any 0 of 1 passed`, `  automatic: 2 retries, 1 reached done, cost $0.40 (1 of 2 attempts reported cost)`, `  Harness-reported cost: $4.70 (4 of 8 attempts reported cost)`, `    claude-opus: 1` and `    Requeued for agent: 1`, and its JSON's `history.cost.perSpec` is `{"101-alpha": 4, "102-beta": 0.7000000000000001}`

### Requirement: Report cost text
The reported cost text of a total and a reported count SHALL be
`not reported` when the total is 0 and the count is 0. Otherwise it is `$`
followed by the total written as JavaScript's `toFixed` writes it: with 2
decimals when the total is at least 0.01, else with 4 decimals. A tie
rounds away from zero.

#### Scenario: Reported cost texts
- **WHEN** a test runs `report` on a scratch root holding one active change `001-a` with `proposal.md`, `tasks/1.md` and `.run/events/1.jsonl` holding a `started` event, then the row's `tokens` event when there is one
- **THEN** the text's `  Harness-reported cost:` line ends with the row's text, and the JSON's `history.cost.perSpec` is the row's:

| Tokens cost | Text | perSpec |
|---|---|---|
| none | `not reported (0 of 1 attempts reported cost)` | `{}` |
| `0` | `$0.0000 (1 of 1 attempts reported cost)` | `{}` |
| `0.125` | `$0.13 (1 of 1 attempts reported cost)` | `{"001-a": 0.125}` |
| `0.005` | `$0.0050 (1 of 1 attempts reported cost)` | `{"001-a": 0.005}` |
| `-0.5` | `$-0.5000 (1 of 1 attempts reported cost)` | `{}` |
