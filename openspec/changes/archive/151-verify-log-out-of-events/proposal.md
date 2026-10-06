---
title: Verify output lives in its own file, and events keep only a tail
depends_on: []
verify: pnpm verify
features:
  reads: [status-inspection, spec-lint-and-approve]
---
## Goal

A verify run's full output goes to its own log file under the change folder's
`.run/logs/`, which git ignores, and the `verify_ran` event keeps only the
last `limits.markerOutputLines` lines and the log's path. `regressed` and
`recertification` events, and a halt's marker, keep the same tail of their
output. Markers that pointed at the `verify_ran` event for the full output
point at the log file instead.

The event log stops growing with the size of the test suite, so a dead
task's patch, a change's commits, and the archive stay small. Today
`verify_ran` output is 119.5 MB of the 134 MB of archived event logs, and a
3.2 MB dead-task patch, mostly `change.jsonl`, caused 149's `commit_failed`
halt.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
`tests/verify-log.test.ts` and `tests/verify-log-sync.test.ts` check the log
files, their git ignore, and the event tails through the shared verify gate
and a sync. The new `tests/event-output-tail.test.ts` checks the halt and
human recertification tails. The three marker excerpt tests check that each
marker's `Full output:` line names a log file that holds the whole output,
and the golden event fixtures carry the new `log` key.

## Non-goals

- Rewriting or shrinking existing archives; old events keep their full output.
- Changing what verify runs, its timeout, or how its result is judged.
- `focused_ran`, `baseline_ran` and `mutation_ran` output, which together are
  under 1% of the archived bytes; their markers still point at their events.
- Keeping full logs after `osq land` (see Decisions below).
- A new config key: the marker limits already say how much of a command's
  output a `.run/` file keeps.

## Surface

- Added: `log` field on `verify_ran` events, the full output's file relative to the change folder, such as `.run/logs/1-2.log`.
- Added: `.run/logs/<target>-<n>.log` files and `.run/logs/.gitignore` in a change folder.
- Changed: `output` of `verify_ran`, `regressed` and `recertification` events, and the body of a halt's `.run/regressed/change.md`, hold at most the last `limits.markerOutputLines` lines, each cut to `limits.markerLineChars`.
- Changed: a marker's `Full output:` line names the log file, such as `Full output: .run/logs/change-3.log`, instead of the `verify_ran` event.
- Changed: `limits.markerOutputLines` and `limits.markerLineChars` also bound those event tails.

## Decisions

- ADR 001: unaffected; no config loading changes.
- ADR 002: unaffected; archive applies deltas as before.
- ADR 004: unaffected.
- ADR 005: unaffected.
- ADR 008: the read index still derives only from the event files, which now hold tails; deleting it still changes nothing but speed.
- ADR 010: unaffected; the validator's run and findings are unchanged, and the verify logs are ignored by git, so they never enter the diff it judges.

**Logs stay out of git.** The full logs are written into an ignored
`.run/logs/` folder rather than committed. Committing them would move the
bloat from `change.jsonl` into other committed files, and git history would
grow as fast as before. What a human loses: once `osq land` removes a
change's worktree, its full logs go with it, and the archive keeps the
40-line tail in each event and the excerpt in each marker. While a change is
running or waiting to land, every log is in its worktree, so a dead or
regressed marker's `Full output:` path can be opened. In a project without
`vcs.enabled`, the logs stay on disk in the archived folder, untracked.

**Measured.** The rule rewritten over real archives (each output cut to its
last 40 lines of at most 400 characters, plus a `log` field):

| Change | `change.jsonl` before | after | all event files before | after |
|---|---|---|---|---|
| 148 approve view | 1,058 KB | 7 KB | 1,126 KB | 69 KB |
| 147 change detail model | 1,395 KB | 9 KB | 1,461 KB | 79 KB |
| 146 web write actions | 1,401 KB | 10 KB | 1,494 KB | 109 KB |
| 142 command inputs | 4,459 KB | 30 KB | 4,729 KB | 319 KB |

## Contract

### Requirement: Verify output logs

Every `verify_ran` event SHALL point at a log file that holds the run's whole
output, and git SHALL never see the log files.

#### Scenario: Log written for a failing verify
- **WHEN** task 1's verify prints 100 lines and fails
- **THEN** `.run/logs/1-1.log` holds all 100 lines, and the `verify_ran` event's `log` is `.run/logs/1-1.log` and its `output` holds lines 61 through 100

#### Scenario: Logs ignored by git
- **WHEN** a verify log is written in a git worktree
- **THEN** `git status` lists nothing under `.run/logs/`

### Requirement: Event output tail

`verify_ran`, `regressed` and `recertification` events, and a halt's marker,
SHALL keep at most the last `limits.markerOutputLines` lines of their output.

#### Scenario: Halt detail cut
- **WHEN** a change halts with a 1,000-line detail
- **THEN** its `.run/regressed/change.md` body and its `regressed` event's `output` hold the last 40 lines

## Human steps

### Before approval

- Land 149 and 150 first: `osq land 149`, then `osq land 150`. 149 changed `src/harness/types.ts`, which task 1 also changes.

### After landing

- Run `pnpm build` and restart `osq watch`; the watcher runs the code it loaded at start.

## Delta

- `specs/watcher-and-harness/spec.md`: adds "Verify output logs", "Verify log files", "Verify logs ignored by git", "Event output tail" and "Events that keep a tail"; modifies "Verify output excerpt in markers", "Emitted verify_ran event exit code and duration", "Scope recertification lifecycle event" and "Dead marker fingerprint", so a log path's run number does not stop two identical deaths from being stuck.
- `specs/version-control/spec.md`: modifies "Default branch sync", whose step 5 now writes the log and records the tail.
- `specs/cli-foundation/spec.md`: modifies "Marker output limits".
- `specs/metrics-and-reporting/spec.md`: modifies "Report events hold no logs".

Two tasks, in order. Task 1 adds the log and tail helpers, writes logs and
tails through the watcher's shared verify gate, points every
`verify_ran`-based marker at its log, tails the scope audit's events, and
regenerates the golden event fixtures. Task 2 does the same for the sync's
`verify_ran` events, and tails halts and human recertifications, using task
1's `writeVerifyLog` and `tailVerifyOutput`. No file is shared between tasks.

## Background

**Why the fingerprint changes.** A dead marker's `Full output:` line now names
a per-run log, `.run/logs/1-1.log` then `.run/logs/1-2.log`, so two identical
deaths would hash differently and the automatic-retry step would never mark
the second stuck (`tests/auto-retry.test.ts`,
`tests/steering-triggers.test.ts`). `normalizeFailureBody` drops the run
number, as it already drops timestamps and temp directory names.

**Writers.** `runVerificationGateResult` in `src/watcher/verify.ts` is the one
watcher path that appends `verify_ran`, for task, pre-spawn, change, scope
audit and archive verifies. `runSyncVerify` in `src/core/vcs/sync-verify.ts`
appends its own `verify_ran` events during a sync, then stages
`change.jsonl` by path; version-control's "Default branch sync" is modified
so its step 5 says the same as the gate. `regressed` events with output come from the scope
audit in `src/watcher/regression.ts` and from `haltWorktreeChange` in
`src/watcher/worktree-run.ts`. `recertification` events with output come
from `autoRecertify` (fed by `regression.ts`) and `retrySpec` in
`src/core/lifecycle/retry.ts`.

**Readers.** `archive-verify.ts` reads its own `verify_ran` line back to
build the marker; it will use the gate result instead. A requeued
recertification's `output` becomes the next executor's prior failure context
through `src/watcher/attempt.ts`; it now gets the tail, which already holds a
failing run's last lines. `osq report` drops `output` from events entirely,
and the dashboard and `osq show` text never print it.

**Why short output is unchanged.** `tests/retry-prior-output.test.ts`,
`tests/osq-change-env.test.ts` and others compare short outputs byte for
byte, trailing newline included. The tail keeps any output within both
limits exactly as it is.

**Why git can't see the logs.** `.run/logs/.gitignore` holds `*`, which also
ignores itself, the way `.osq/` does for the read index. A dead task's patch
(`git add -A` on a temporary index), the verified and dead commits, the
clean-tree check (`git status --untracked-files=all`) and the land all
respect it. Archive moves the change folder with `fs.rename`, so the logs
move with it. A default-branch restart or a draft restore that trims `.run/`
drops them, which is fine for files that are disposable.

**Why `haltWorktreeChange` takes the limits last and optionally.** The frozen
`tests/worktree-run.test.ts` calls it with four arguments. A fifth parameter
defaulting to `DEFAULT_CONFIG.limits` keeps that call valid, as
`buildScopeRegressionMarker` already does, and every watcher call passes
`config.limits`.

**Line budgets.** `src/watcher/regression.ts` is at 248 of 250 lines and
`src/core/foundation/config.ts` at 249, which is why no config key is added.
`src/harness/types.ts` and `src/watcher/loop.ts` are on the line-budget allow
list.
