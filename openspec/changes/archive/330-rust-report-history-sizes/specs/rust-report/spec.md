## MODIFIED Requirements

### Requirement: Report summary
`report` SHALL return the text TypeScript's `reportCommand` returns without
`--json`, byte for byte, from its first line through the last line of its
`History:` section, the line before the first blank line after `History:`,
with no newline at the end. The text is:
`osq Delivery Metrics Report`, a blank line, `Specs Summary:`, then
`  Total specs: <total> (<active> active, <archived> archived)`, a blank
line, `Now:`, then `  Total tasks:`, `  Done:`, `  Verified done:`,
`  Manual done:`, `  Dead:`, `  Regressed:`, `  Running:`, `  Pending:`
and `  Unmarked:`, each followed by a space and its count, then
`  Completion rate: <rate>%`, then the `History:` lines that rust-report
"Report history" gives, then the lines that rust-report "Report history
blocks" and "Report sizes" give. With `--json`, `report` SHALL return the
`completionRate`, `now` and `specs` members of TypeScript's
`report --json` object, and its `history` member with only the
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

## ADDED Requirements

### Requirement: Report history blocks
`report` SHALL gather rework, executor disclosures and added dependencies
as TypeScript's `collectRework`, `collectDisclosures` and
`collectDependencies` do, over every change entry that is not rejected. A
change's id is the leading digits of its folder name padded with zeros to
at least three digits, or the whole folder name when it has none. Two ids
or folder names are ordered by their leading numbers when both have one
and the numbers differ, else by bytes.

- `rework`: for each entry, every id that storage's `read_change_fixes`
  gives names a fixed change, and the entry's id is one of its fixers.
  Each fixed id gives one entry `{change, fixedBy}`, with its distinct
  fixer ids in order, and the entries are in order of `change`.
- `disclosures`: each entry whose storage `read_result_disclosures` holds
  a section gives `{change, deviated, missingContext, outsideScope}`, the
  number of its disclosures holding each section. The entries are sorted
  by `change`, by bytes.
- `dependencies`: each entry for which storage's
  `read_dependencies_added` gives a pair gives `{change, added}`, with the
  folder name as `change` and `added` its pairs as `{file, name}`. The
  entries are in order of `change`.

The text SHALL follow the `    Requeued for agent:` line with `Rework:`,
then `  <change>: fixed by <fixedBy joined by ", ">` for each entry, or
`  (none)`; then `Executor disclosures:`, then
`  <change>: deviated <n>, missing context <n>, outside scope <n>` for
each entry, or `  (none)`; then, only when there is an entry,
`Dependencies added:` and `  <change>: <pairs>` for each, where each pair
is written `<name> (<file>)` and the pairs are joined by `, `.

#### Scenario: Blocks of the sizes project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/sizes-project`, with and without `--json`
- **THEN** its text holds these lines in this order, right after `    Requeued for agent: 0`, and its JSON's `history.rework`, `history.disclosures` and `history.dependencies` hold the same entries:

| Line |
|---|
| `Rework:` |
| `  001: fixed by 203` |
| `  201: fixed by 202` |
| `  abc: fixed by 203` |
| `Executor disclosures:` |
| `  201: deviated 1, missing context 0, outside scope 0` |
| `  202: deviated 0, missing context 1, outside scope 1` |
| `  203: deviated 1, missing context 0, outside scope 1` |
| `Dependencies added:` |
| `  202-second: anyhow (Cargo.toml), serde (Cargo.toml), zod (package.json)` |

#### Scenario: No blocks in the history project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/history-project`, with and without `--json`
- **THEN** its text holds `Rework:`, `  (none)`, `Executor disclosures:` and `  (none)` right after `    Requeued for agent: 1`, no line is `Dependencies added:`, and its JSON's `history` has no `rework`, `disclosures` or `dependencies` member

### Requirement: Report sizes
`report` SHALL measure task sizes as TypeScript's `buildMetricsReport`
does, from storage's `read_task_sizes` of every change entry that is not
rejected, and print them as its `formatMetricsReport` does. A task's
change is its entry's folder name. `round2(x)` is JavaScript's
`Math.round(x * 100) / 100`, which rounds a half up.

A size of at most 2 is in bucket `1-2`, at most 4 in `3-4`, at most 8 in
`5-8`, and any other in `over-8`. A bucket row for a list of tasks and a
size, scope files or acceptance lines, holds `bucket`, `tasks`, the
number of tasks in the bucket, `firstAttemptPassRate`, `round2` of the
share of those tasks whose first attempt passed, `meanAttempts`, `round2`
of their mean attempts, both 0 for an empty bucket, and
`medianDurationSeconds`, `round2` of the median of their known durations
in seconds, the mean of the two middle values for an even count, or null
when none is known. Every table lists the four buckets in that order.

`history.sizes` SHALL hold `byAcceptanceLines`, the rows of every
measured task by acceptance lines, and `scopeFileSeries`: first the
`legacy` series of the tasks whose resolver is `Legacy`, then the
`resolver-2` series of those whose resolver is `Second`. A task whose
resolver is `Other` is in no series. Each series holds `resolver`,
`byScopeFiles`, its rows by scope files, `startsAtChange`, the least
change of its tasks in the order of rust-report "Report history blocks"
for `resolver-2` and null for `legacy` or with no task, and
`largestFirstAttemptPass`. That is null when no task of the series passed
its first attempt, else `{change, task, title, scopeFiles,
acceptanceLines}` of the passing task with the most scope files, then the
most acceptance lines, then the least change and then the least task in
that order.

The text SHALL follow the blocks of "Report history blocks" with
`  Size by scope files (legacy):` and its table, then
`  Size by scope files (resolver-2):` and its table, then
`  Resolver 2 starts at: <startsAtChange>`, or `unavailable` for null,
then `  Size by acceptance lines:` and its table. A table is the line
`    bucket     tasks  first-attempt pass rate  mean attempts  median duration`
and then one line per row: four spaces, then the bucket padded to 10, a
space, the tasks padded to 6, a space, the pass rate padded to 23, a
space, the mean attempts padded to 14, a space, and the median as
TypeScript's `formatDuration` writes that many seconds times 1000, or
`unavailable` for null. Padding adds spaces on the right, and numbers are
written as JavaScript writes them.

The hint series is `resolver-2` when one of its rows has a task, else
`legacy`. When its largest first-attempt pass is not null, each limit
within 1 of that pass gives a part: `scope files <n> is within 1 of
configured maxScopeFiles <limit>` when `limits.maxScopeFiles` is, then
`acceptance lines <n> is within 1 of configured maxAcceptanceLines
<limit>` when `limits.maxAcceptanceLines` is. When there is a part, the
text ends with
`  Size hint: largest first-attempt pass <change>/<task> — <parts joined by "; ">`.

#### Scenario: Sizes of the sizes project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/sizes-project`, with and without `--json`
- **THEN** its text ends with these lines, and its JSON's `history.sizes.byAcceptanceLines` row `3-4` has `medianDurationSeconds` `52.78` and its `resolver-2` series row `3-4` has `45.56`:

| Line |
|---|
| `  Size by scope files (legacy):` |
| `    bucket     tasks  first-attempt pass rate  mean attempts  median duration` |
| `    1-2        1      1                       1              1m` |
| `    3-4        0      0                       0              unavailable` |
| `    5-8        1      0                       2              4m 30s` |
| `    over-8     0      0                       0              unavailable` |
| `  Size by scope files (resolver-2):` |
| `    bucket     tasks  first-attempt pass rate  mean attempts  median duration` |
| `    1-2        0      0                       0              unavailable` |
| `    3-4        1      0                       1              46s` |
| `    5-8        0      0                       0              unavailable` |
| `    over-8     1      1                       1              30m` |
| `  Resolver 2 starts at: 202-second` |
| `  Size by acceptance lines:` |
| `    bucket     tasks  first-attempt pass rate  mean attempts  median duration` |
| `    1-2        1      1                       1              unavailable` |
| `    3-4        2      0.5                     1              53s` |
| `    5-8        1      1                       1              30m` |
| `    over-8     1      0                       2              4m 30s` |
| `  Size hint: largest first-attempt pass 202-second/1 — scope files 9 is within 1 of configured maxScopeFiles 8; acceptance lines 7 is within 1 of configured maxAcceptanceLines 7` |

#### Scenario: Size hints
- **WHEN** a test copies `tests/fixtures/summary/sizes-project` to a scratch folder, removes the row's event files, writes an `osq.toml` holding `[limits]` with the row's `maxScopeFiles` and `maxAcceptanceLines`, and runs `report`
- **THEN** the text's last line is the row's hint, or for `none` no line starts with `  Size hint:` and the last line is the `over-8` row of `  Size by acceptance lines:`:

| maxScopeFiles | maxAcceptanceLines | Removed event files | Hint |
|---|---|---|---|
| 8 | 7 | none | `  Size hint: largest first-attempt pass 202-second/1 — scope files 9 is within 1 of configured maxScopeFiles 8; acceptance lines 7 is within 1 of configured maxAcceptanceLines 7` |
| 11 | 8 | none | `  Size hint: largest first-attempt pass 202-second/1 — acceptance lines 7 is within 1 of configured maxAcceptanceLines 8` |
| 9 | 5 | none | `  Size hint: largest first-attempt pass 202-second/1 — scope files 9 is within 1 of configured maxScopeFiles 9` |
| 6 | 10 | none | none |
| 9 | 3 | `archive/202-second/.run/events/1.jsonl` | none |
| 3 | 9 | `archive/202-second/.run/events/1.jsonl`, `203-third/.run/events/1.jsonl` | `  Size hint: largest first-attempt pass 201-first/1 — scope files 2 is within 1 of configured maxScopeFiles 3` |

Each removed path is under `openspec/changes/` of the copy.
