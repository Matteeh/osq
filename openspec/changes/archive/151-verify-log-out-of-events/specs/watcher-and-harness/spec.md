## ADDED Requirements

### Requirement: Verify output logs
Every `verify_ran` event that the shared verify gate
(`runVerificationGateResult` with an event context) or a sync
(`runSyncVerify`) appends SHALL have a `log`: the path, relative to the
change folder, of a file written before the event that holds the run's whole
output as the shared verification runner returned it. Its `output` SHALL be
the tail "Event output tail" defines, present only when that tail is not
blank. The gate's result SHALL carry the same `log`.

#### Scenario: Log written for a failing verify
- **WHEN** task 1's verify prints 100 lines and fails
- **THEN** `.run/logs/1-1.log` holds all 100 lines, and the `verify_ran` event's `log` is `.run/logs/1-1.log` and its `output` holds lines 61 through 100

#### Scenario: Blank output
- **WHEN** a verify prints nothing
- **THEN** its log file exists and is empty, and its `verify_ran` event has a `log` and no `output`

#### Scenario: Sync verify log
- **WHEN** a sync runs a task's verify that prints 100 lines and passes
- **THEN** the `verify_ran` event the sync appends to `change.jsonl` has a `log` naming a `.run/logs/change-<n>.log` file that holds all 100 lines, an `output` with lines 61 through 100, and the sync commit holds no file under `.run/logs/`

### Requirement: Verify log files
`writeVerifyLog` in `src/core/run/verify-log.ts` SHALL write every verify log
to `.run/logs/<target>-<n>.log` in the change folder. `<target>` is the event
stream's target: the task number, or `change`. `<n>` is one more than the
number of `<target>-<k>.log` files already there, so the first run of task 1
writes `.run/logs/1-1.log` and the next `.run/logs/1-2.log`. A blank output
SHALL still get its file.

#### Scenario: Next run of the same target
- **WHEN** task 1's verify runs again after `.run/logs/1-1.log` exists
- **THEN** it writes `.run/logs/1-2.log` and leaves `.run/logs/1-1.log` unchanged

### Requirement: Verify logs ignored by git
Before it writes the first log in a change folder, `writeVerifyLog` SHALL
create `.run/logs/.gitignore` holding the line `*`, so git ignores every file
in that folder, the ignore file included. No dead task's patch, verified or
dead task's commit, sync commit, clean-tree check or land SHALL carry a log
file.

#### Scenario: Logs ignored by git
- **WHEN** a verify log is written in a git worktree
- **THEN** `.run/logs/.gitignore` holds `*` and `git status --porcelain --untracked-files=all` lists nothing under `.run/logs/`

### Requirement: Event output tail
`tailVerifyOutput` in `src/core/run/verify-excerpt.ts` SHALL build every
event output tail. A text of at most `limits.markerOutputLines` lines, none
longer than `limits.markerLineChars` characters, SHALL be kept exactly,
trailing newline included. Any other text, after trailing whitespace is
trimmed, SHALL keep its last `limits.markerOutputLines` lines, each line
longer than `limits.markerLineChars` cut as "Verify output excerpt in
markers" cuts it. A blank text SHALL become the empty string.

#### Scenario: Short output kept exactly
- **WHEN** a recorded output is `before red after\n`
- **THEN** the event's `output` is `before red after\n`

#### Scenario: Long output cut to its tail
- **WHEN** a recorded output is 100 numbered lines and `limits.markerOutputLines` is 40
- **THEN** the event's `output` is lines 61 through 100

#### Scenario: Long line cut in a tail
- **WHEN** a kept line is 1,000 characters long and `limits.markerLineChars` is 400
- **THEN** the event's `output` holds its first 400 characters followed by `… (600 more characters)`

### Requirement: Events that keep a tail
The `output` of `verify_ran`, `regressed` and `recertification` events, and
the body of a halt's `.run/regressed/change.md`, SHALL be the "Event output
tail" of the text they record. That covers the scope audit's `regressed`
event and the automatic recertification it triggers, `osq retry`'s
recertification, and every halt `haltWorktreeChange` writes. A requeued
recertification's prior failure context for the next executor is that tail.

#### Scenario: Halt detail cut
- **WHEN** a change halts with a 1,000-line detail
- **THEN** its `.run/regressed/change.md` body and its `regressed` event's `output` hold the last 40 lines

#### Scenario: Configured tail length
- **WHEN** `limits.markerOutputLines` is 5 and a change halts with a 1,000-line detail
- **THEN** its `regressed` event's `output` holds the last 5 lines

#### Scenario: Scope audit tails
- **WHEN** a scope audit re-runs a done task's verify and it prints 100 lines
- **THEN** the `regressed` or automatic `recertification` event it records holds lines 61 through 100

#### Scenario: Human recertification tail
- **WHEN** `osq retry` recertifies a scope-regressed task whose verify prints 100 lines and fails
- **THEN** its `recertification` event records `outcome: requeued` and an `output` of lines 61 through 100

## MODIFIED Requirements

### Requirement: Verify output excerpt in markers
Every marker the watcher builds from a command's output SHALL hold an excerpt
of that output in place of the whole output. These are the `verify_red` and
`scope_regression` regressed markers, and the `verify_red` (task verify and
focused run), `verify_precondition`, `change_verify_red`, and `baseline_red`
dead markers. Wherever another requirement says such a marker carries output,
it carries this excerpt. `excerptVerifyOutput` in
`src/core/run/verify-excerpt.ts` SHALL build every excerpt from the run's
whole output.

When the output has a line that starts with `✖ failing tests:` after leading
whitespace, the excerpt SHALL be the last such line through the end of the
output. Otherwise it SHALL be the last `limits.markerOutputLines` lines of the
output. Output that is empty or only whitespace SHALL become `(no output)`. Any
excerpt line longer than `limits.markerLineChars` characters SHALL be cut to
its first `limits.markerLineChars` characters followed by
`… (<n> more characters)`, where `<n>` is the number of characters cut.

The excerpt SHALL end with a line naming where the whole output is. For a
marker built from a verify that wrote a `verify_ran` event (task verify,
pre-spawn, change verify, archive verify, and scope audit), it SHALL be
`Full output: <log>`, where `<log>` is that event's `log` from "Verify output
logs", such as `Full output: .run/logs/change-3.log`. For a focused run it
SHALL be `Full output: the focused_ran event in .run/events/<n>.jsonl`, and for
a baseline `Full output: the baseline_ran event in .run/events/change.jsonl`;
those two events SHALL keep the full output. A timed-out task verify's
`verify_red` marker SHALL keep its timeout message and hold no excerpt.

#### Scenario: Archive failure keeps the failing tests
- **WHEN** archive-time change-level verification fails and its output is 500 lines followed by a `✖ failing tests:` section
- **THEN** `.run/regressed/change.md` holds the section and none of the 500 earlier lines, and its last line is `Full output: <log>` for the `log` of the `verify_ran` event in `.run/events/change.jsonl`
- **AND** that log file holds the full output

#### Scenario: Output without a failing-tests section
- **WHEN** a failing verify prints 100 numbered lines and no `✖ failing tests:` line, with `limits.markerOutputLines` at 40
- **THEN** the marker holds lines 61 through 100 and none of lines 1 through 60

#### Scenario: Long line cut
- **WHEN** a kept output line is 1,000 characters long and `limits.markerLineChars` is 400
- **THEN** the marker holds its first 400 characters followed by `… (600 more characters)`

#### Scenario: Task verify dead marker
- **WHEN** task 1's verify fails with 100 lines of output
- **THEN** `.run/dead/1.md` holds the last 40 lines and ends with `Full output: .run/logs/1-<n>.log`, naming the log of that run, which holds all 100 lines

#### Scenario: Change verify dead marker
- **WHEN** the change-level verify fails after task 1's verify passes
- **THEN** `.run/dead/1.md` holds the excerpt and ends with `Full output: .run/logs/change-<n>.log`, naming the log of that run

#### Scenario: Focused run dead marker
- **WHEN** a focused scenario test fails with 100 lines of output
- **THEN** `.run/dead/<n>.md` holds the excerpt after `Watcher focused scenario tests failed:` and ends with `Full output: the focused_ran event in .run/events/<n>.jsonl`

#### Scenario: Scope regression marker
- **WHEN** a scope audit re-runs a done task's verify and it fails with 100 lines of output
- **THEN** `.run/regressed/<n>.md` keeps its differing paths and holds the excerpt, ending with `Full output: .run/logs/<n>-<k>.log`, naming the log of that run

#### Scenario: Empty output
- **WHEN** a failing verify prints nothing
- **THEN** the excerpt is `(no output)` followed by the `Full output:` line

### Requirement: Emitted verify_ran event exit code and duration
The task, incremental change, scope-audit, and archive verification gates SHALL
execute commands through one core process implementation that returns command,
exit code, duration, output, and timeout state. Watcher callers SHALL emit
`verify_ran` events through the single watcher verification entrypoint, which
writes the run's log and records its tail as "Verify output logs" says. Core
verification SHALL NOT import watcher or harness modules.

#### Scenario: Verified task event fields
- **WHEN** task verification succeeds
- **THEN** runner emits a `verify_ran` event containing `command`, `exitCode: 0`, wall-clock `duration`, the `log` path, and the output's tail when it is not blank

#### Scenario: Failed task event fields
- **WHEN** task verification exits with non-zero code or times out
- **THEN** runner emits a `verify_ran` event containing `command`, non-zero `exitCode`, elapsed `duration`, the `log` path, the output's tail, and timeout state

#### Scenario: Incremental change verification attribution
- **WHEN** runner executes the proposal verify after a passing task verify
- **THEN** the same watcher verification entrypoint appends its `verify_ran` event to the established change-level target

#### Scenario: Single verification event emission path
- **WHEN** watcher verification or explicit scope recertification executes a verify command
- **THEN** both use the same timeout-bounded core process implementation without violating core import isolation

### Requirement: Scope recertification lifecycle event
The lifecycle event union SHALL include a typed `recertification` event carrying
task, outcome, differing paths and attribution, verify command, exit code,
the output's tail from "Event output tail" and timeout state, recorded or
original scope hash, and current scope hash. Outcome SHALL be `passed` when
human retry or automatic scope recertification refreshes the trusted done
record and `requeued` when failed verification returns the task to agent
work. An automatic recertification's event SHALL carry `automatic: true`; a
human one SHALL carry no `automatic` key.

A passed recertification SHALL not advance execution attempts. A requeued
recertification SHALL retain the next execution attempt and failed verification
context in append-only state so a restarted watcher supplies them to the next
executor.

#### Scenario: Human recertification passes
- **WHEN** explicit retry verification exits zero for a scope-regressed task
- **THEN** one `recertification` event records `outcome: passed` without a retry, started event, or execution-attempt increment

#### Scenario: Human recertification requeues
- **WHEN** explicit retry verification exits non-zero or times out
- **THEN** one `recertification` event records `outcome: requeued` and preserves the next attempt and the tail of the failing output for a later agent spawn

#### Scenario: Automatic recertification event
- **WHEN** the watcher recertifies a task automatically
- **THEN** one `recertification` event records `outcome: passed` and `automatic: true` without a retry, started event, or execution-attempt increment

### Requirement: Dead marker fingerprint
Every dead marker's frontmatter SHALL record `fingerprint: sha256:<hex>`,
hashed over the reason and the marker body after stripping ANSI codes and
replacing ISO timestamps, durations including a number after a duration key,
PIDs, absolute paths under the project root, paths under the temp directory,
and the run number of a verify log path with fixed placeholders. A temp path,
matched by `os.tmpdir()` and its real path, keeps what follows its first
segment: `/tmp/x-Hf38F/a.db` becomes `<tmp>/a.db`. A verify log path keeps its
target: `.run/logs/1-2.log` becomes `.run/logs/1-<n>.log`.

#### Scenario: Volatile details
- **WHEN** two markers with the same reason differ only in timestamps, durations, PIDs, ANSI codes, temp directory names, or the project root path
- **THEN** their fingerprints are equal

#### Scenario: Repeated node:test failure
- **WHEN** the same failing `node:test` file, creating and printing a `mkdtemp` directory, runs twice and each output becomes a dead marker
- **THEN** the two markers have the same fingerprint

#### Scenario: Different failures
- **WHEN** two markers differ in reason, in a failing test name, or in an assertion message
- **THEN** their fingerprints differ

#### Scenario: Verify log run number
- **WHEN** two task 1 dead markers differ only in `Full output: .run/logs/1-1.log` and `Full output: .run/logs/1-2.log`
- **THEN** their fingerprints are equal, and a marker naming `.run/logs/2-1.log` instead has a different fingerprint
