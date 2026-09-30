## ADDED Requirements

### Requirement: Verify output excerpt in markers
Every marker the watcher builds from a command's output SHALL hold an excerpt
of that output in place of the whole output. These are the `verify_red` and
`scope_regression` regressed markers, and the `verify_red` (task verify and
focused run), `verify_precondition`, `change_verify_red`, and `baseline_red`
dead markers. Wherever another requirement says such a marker carries output,
it carries this excerpt. `excerptVerifyOutput` in
`src/core/run/verify-excerpt.ts` SHALL build every excerpt.

When the output has a line that starts with `✖ failing tests:` after leading
whitespace, the excerpt SHALL be the last such line through the end of the
output. Otherwise it SHALL be the last `limits.markerOutputLines` lines of the
output. Output that is empty or only whitespace SHALL become `(no output)`. Any
excerpt line longer than `limits.markerLineChars` characters SHALL be cut to
its first `limits.markerLineChars` characters followed by
`… (<n> more characters)`, where `<n>` is the number of characters cut.

The excerpt SHALL end with the line
`Full output: the <event> event in .run/events/<target>.jsonl`, naming the
event that holds the full output: `verify_ran` in the stream of the task or
`change` target that ran the verify, `focused_ran` in the task's stream for a
focused run, and `baseline_ran` in `change.jsonl` for a baseline. Those events
SHALL keep the full output. A timed-out task verify's `verify_red` marker SHALL
keep its timeout message and hold no excerpt.

#### Scenario: Archive failure keeps the failing tests
- **WHEN** archive-time change-level verification fails and its output is 500 lines followed by a `✖ failing tests:` section
- **THEN** `.run/regressed/change.md` holds the section and none of the 500 earlier lines, and its last line is `Full output: the verify_ran event in .run/events/change.jsonl`
- **AND** the `verify_ran` event in `.run/events/change.jsonl` holds the full output

#### Scenario: Output without a failing-tests section
- **WHEN** a failing verify prints 100 numbered lines and no `✖ failing tests:` line, with `limits.markerOutputLines` at 40
- **THEN** the marker holds lines 61 through 100 and none of lines 1 through 60

#### Scenario: Long line cut
- **WHEN** a kept output line is 1,000 characters long and `limits.markerLineChars` is 400
- **THEN** the marker holds its first 400 characters followed by `… (600 more characters)`

#### Scenario: Task verify dead marker
- **WHEN** task 1's verify fails with 100 lines of output
- **THEN** `.run/dead/1.md` holds the last 40 lines and ends with `Full output: the verify_ran event in .run/events/1.jsonl`

#### Scenario: Change verify dead marker
- **WHEN** the change-level verify fails after task 1's verify passes
- **THEN** `.run/dead/1.md` holds the excerpt and ends with `Full output: the verify_ran event in .run/events/change.jsonl`

#### Scenario: Focused run dead marker
- **WHEN** a focused scenario test fails with 100 lines of output
- **THEN** `.run/dead/<n>.md` holds the excerpt after `Watcher focused scenario tests failed:` and ends with `Full output: the focused_ran event in .run/events/<n>.jsonl`

#### Scenario: Scope regression marker
- **WHEN** a scope audit re-runs a done task's verify and it fails with 100 lines of output
- **THEN** `.run/regressed/<n>.md` keeps its differing paths and holds the excerpt, ending with `Full output: the verify_ran event in .run/events/<n>.jsonl`

#### Scenario: Empty output
- **WHEN** a failing verify prints nothing
- **THEN** the excerpt is `(no output)` followed by the `Full output:` line

## MODIFIED Requirements

### Requirement: Baseline verify before a change's first task
When `gates.baselineVerify` is set and none of the change's task streams holds
a `started` event, `runTask` SHALL settle the baseline before its pre-spawn
verify or agent spawn. It SHALL run the command in the project root
with `timeouts.verifyTimeoutSeconds` and without `OSQ_CHANGE`, and append one
`baseline_ran` event to the change stream with `outcome`, `command`, `commit`,
`treeDigest`, `exitCode`, and `durationSeconds`. A failed run's event SHALL
also have `output`, the command's full output, when that output is not empty.
When the command fails, the task SHALL die with `baseline_red`. Its dead
marker SHALL start with "tree was red before this change started", then name
the command, its exit code, and `osq retry <id> <n>`, then carry the output
excerpt, which ends with
`Full output: the baseline_ran event in .run/events/change.jsonl`. The outcome
line SHALL end with "tree was red before this change started". `baseline_red`
SHALL NOT be retried automatically.

#### Scenario: Green baseline
- **WHEN** the baseline command exits 0 before task 1 of a change
- **THEN** a `baseline_ran` event with `outcome: passed` precedes task 1's `started` event

#### Scenario: Retry after a red baseline
- **WHEN** a human fixes the tree and runs `osq retry <id> 1` after `baseline_red`
- **THEN** the baseline runs again before task 1 spawns

#### Scenario: Change already started
- **WHEN** task 2 of a change runs after task 1 started
- **THEN** no baseline runs and no `baseline_ran` event is appended

#### Scenario: Gate unset
- **WHEN** `gates.baselineVerify` is unset
- **THEN** no baseline runs and no `baseline_ran` event is appended

#### Scenario: Red baseline keeps its output
- **WHEN** the baseline command fails with 100 lines of output
- **THEN** its `baseline_ran` event has `outcome: failed` and the full output, and the `baseline_red` dead marker holds the last 40 lines and the `Full output:` line
