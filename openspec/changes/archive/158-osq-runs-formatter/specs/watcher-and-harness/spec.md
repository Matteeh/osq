## ADDED Requirements

### Requirement: Format before verify
When `gates.formatCommand` is set, the watcher SHALL format a task's changed
files after the agent exits and before the focused run and the task's verify:
after the `## Blocked`, denied-dependency, and missing-verify-path checks pass.
The changed files SHALL be the paths in the task's resolved scope that exist
now and whose content differs from the snapshot osq took of the scope before
the agent spawned, sorted. A file outside the task's scope SHALL never be
passed. With no changed file, or no command, nothing runs and nothing is
recorded.

The command SHALL run once, with `{files}` replaced by the changed files,
each single-quoted and separated by spaces, through `runVerificationCommand`
with the verify role, the task's change folder, and `verifyTimeoutSeconds`.
osq SHALL append one `format_ran` event to the task's stream with data
`{ command, files, exitCode, duration, timedOut, output }`: the resolved
command, the files, the run's result, and the output tail
`tailVerifyOutput` keeps, present only when not blank.

A failing or timed-out format command SHALL NOT end the attempt: the watcher
logs one warning naming the exit code and goes on, and verify decides. What
the command writes is part of the task's work: the focused run, the verify,
the change-level verify, the done marker's scope hashes, the `measures` end
event, and, in a worktree, the task's commit all see the formatted files.

#### Scenario: Changed scoped files are formatted
- **WHEN** a task's scope is `src/a.ts`, `src/b.ts` and `src/c.ts`, the agent changes `src/a.ts`, creates `src/b.ts`, and leaves `src/c.ts`, and `gates.formatCommand` is `node fmt.cjs {files}`
- **THEN** the command runs as `node fmt.cjs 'src/a.ts' 'src/b.ts'`, one `format_ran` event records `files: ["src/a.ts", "src/b.ts"]` and `exitCode: 0`, `src/c.ts` is unchanged, and the task's verify sees the formatted content

#### Scenario: Files the command may not get
- **WHEN** the agent deletes scoped `src/old.ts` and creates `tests/new.test.ts` outside the scope, besides changing scoped `src/a.ts`
- **THEN** the command gets only `'src/a.ts'`

#### Scenario: Done marker holds the formatted hashes
- **WHEN** the format command rewrites `src/a.ts` and the task's verify passes
- **THEN** the done marker's scope hash for `src/a.ts` is the hash of the formatted content, so the next scope audit finds no change

#### Scenario: Failing format command
- **WHEN** the format command exits 1 and the task's verify passes
- **THEN** the `format_ran` event records `exitCode: 1`, the watcher logged one warning, and the task reaches done

#### Scenario: Nothing to format
- **WHEN** `gates.formatCommand` is unset, or the agent changed no scoped file
- **THEN** no format command runs and the task's stream holds no `format_ran` event

#### Scenario: Blocked task
- **WHEN** the agent writes `## Blocked` in its result
- **THEN** the task dies with `blocked` and no format command runs
