# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Blocked exit
<!-- source: src/watcher/blocked.ts, src/watcher/task-verify.ts, src/watcher/runner.ts, src/watcher/failure-reason.ts, tests/blocked-exit.test.ts -->
After the agent exits and the runner has made sure a result file exists, a
result file whose `## Blocked` section `parseResultSections` reads as present
SHALL make the task die with reason `blocked`. The runner SHALL check this
before the missing verify path check, the task verify, and the change verify,
and SHALL run none of them for a blocked task. The dead marker SHALL carry
`reason: blocked` in its frontmatter and the stated need in its body, and one
`dead` event SHALL record reason `blocked`. A `## Blocked` section that is empty
or says only `None` SHALL leave the task to the checks that follow, as before.
`blocked` SHALL NOT be one of the reasons eligible for an automatic retry.

#### Scenario: Executor stops blocked
- **WHEN** a fake agent writes a result file whose `## Blocked` says `Needs src/b.ts in scope` and writes no code
- **THEN** the task dies with `blocked`, the dead marker body holds `Needs src/b.ts in scope`, and no `verify_ran` event follows the agent's exit

#### Scenario: Blocked task is not retried
- **WHEN** a watcher cycle with `gates.autoRetries` of 1 sees a task that died with `blocked`
- **THEN** the task stays dead and no `retry` event is appended

#### Scenario: Blocked says None
- **WHEN** the result file's `## Blocked` says only `None`
- **THEN** the task goes through the missing-path check and verify as before

### Requirement: Automatic scope recertification
<!-- source: src/watcher/auto-recertify.ts, src/watcher/regression.ts, src/watcher/loop.ts, src/core/lifecycle/recertify.ts, src/core/lifecycle/retry.ts, src/harness/types.ts, tests/auto-recertify.test.ts -->
When the scope recertification audit finds a stale done task that has no
active regression marker, the watcher SHALL recertify that task without a human
only when it has at least one differing path and, for every differing path, all
of these hold:

1. A later-numbered task in the same change has a resolved approved `scope`
   that covers the path, as `scopeCoversPath` decides.
2. That later task's `measures` end events carry the path from the done task's
   recorded hash to the current hash without a gap: one end event's `before`
   equals the done marker's recorded `scope_files` hash, each later end event's
   `before` equals the previous one's `after`, and the last end event's `after`
   equals the current hash. A missing hash counts as `null`, which means the
   file was absent.
3. The done task's verify passes at detection.

An automatic recertification SHALL refresh the done marker through the same
function `osq retry` uses for a passing recertification. It SHALL append one
`recertification` event with `outcome: passed` and `automatic: true`, carrying
the same differing paths, attribution, verify result, and hashes as a human
recertification. It SHALL write no regression marker and no `regressed` event,
and it SHALL not halt the change. The watcher SHALL log one line per
automatically recertified task. Any other stale task SHALL be recorded and
halt the change exactly as before.

#### Scenario: A later task extends the file
- **WHEN** task 1 finished with `src/a.ts`, task 2's scope covers it, task 2 is the only thing that changed it, and task 1's verify passes
- **THEN** task 1's done marker holds the current hashes with `recertification_count: 1`, one `recertification` event carries `outcome: passed` and `automatic: true`, no `.run/regressed/1.md` exists, and task 3 runs

#### Scenario: Verify fails at detection
- **WHEN** the chain is intact but task 1's verify fails
- **THEN** task 1 gets a regression marker and a `regressed` event, and the change halts

#### Scenario: Human edit breaks the chain
- **WHEN** `src/a.ts` was edited by hand between task 1's done marker and task 2's start
- **THEN** task 2's first `before` doesn't match task 1's recorded hash, so task 1 gets a regression marker and the change halts

#### Scenario: File outside every later scope
- **WHEN** a changed file of task 1 is covered by no later task's scope
- **THEN** task 1 gets a regression marker and the change halts

#### Scenario: Resolver upgrade only
- **WHEN** a done marker lacks the current resolver version but no file differs
- **THEN** it is recorded as a scope regression exactly as before

## MODIFIED Requirements

### Requirement: Scope recertification audit
<!-- source: src/core/scope.ts, src/core/scope-hash.ts, src/core/verification.ts, src/watcher/regression.ts, src/watcher/loop.ts, src/harness/types.ts, tests/scope-recertification.test.ts, tests/scope-resolver-upgrade.test.ts -->
Before locking an upcoming task, the watcher SHALL compare every earlier
automated done task's recorded resolver-aware scope hash and resolver version
with the current tree in one audit. Every stale task SHALL run its own verify
command under the configured verify timeout. A stale task that automatic scope
recertification recertifies SHALL be done again. Every other stale task SHALL
receive an active regression marker and typed regression event containing
sorted differing paths, verification command and result, recorded and current
scope hashes, resolver upgrade context, and per-path attribution whether
verification passed or failed.

A differing path SHALL be attributed to a later done task only when exactly one
later task's normalized file-change events name a resolver-produced path and
the current file hash agrees with that task's resolver-produced completion hash
when available. Multiple qualifying tasks SHALL be `ambiguous`; absence of a
trustworthy candidate SHALL be `unknown`.

An active regression marker SHALL make later audits idempotent. Any newly
regressed task SHALL return `blocked_by_regression` without locking, running,
counting, or writing failure state for the upcoming task. Logging SHALL contain
one stale-task line followed by one numerically ordered change summary.

#### Scenario: More than one completed task is stale
- **WHEN** multiple earlier done tasks differ from their recorded resolved scopes before another task is due
- **THEN** every stale task is verified and recorded in one audit while the upcoming task remains unlocked and excluded from `tasksRun`

#### Scenario: Resolver version is stale
- **WHEN** an automated active done marker lacks `scope_resolver: 2` even though its aggregate hash matches
- **THEN** detection verification runs once and records a scope regression with resolver-upgrade context and no invented differing file path

#### Scenario: Detection verification times out
- **WHEN** a stale task's verify command exceeds `verifyTimeoutSeconds`
- **THEN** its marker and event retain the timeout result and the change halts for human recertification

#### Scenario: Halted cycle repeats
- **WHEN** another watcher cycle observes the same active scope regression markers
- **THEN** it writes no duplicate markers or events and does not re-run detection verification

#### Scenario: Later edit attribution
- **WHEN** normalized file-change and resolver-produced completion evidence identifies one later done task for a differing path
- **THEN** the marker and event name that task, otherwise recording `ambiguous` or `unknown` according to the evidence

#### Scenario: Automatically recertified task
- **WHEN** the only stale task qualifies for automatic scope recertification
- **THEN** the audit reports no regressed task and the upcoming task runs

### Requirement: Scope recertification lifecycle event
<!-- source: src/harness/types.ts, src/core/retry.ts, src/core/lifecycle/recertify.ts, src/watcher/auto-recertify.ts, src/watcher/attempt.ts, src/watcher/spawn.ts, tests/retry-recertification.test.ts, tests/auto-recertify.test.ts -->
The lifecycle event union SHALL include a typed `recertification` event carrying
task, outcome, differing paths and attribution, verify command, exit code,
output and timeout state, recorded or original scope hash, and current scope
hash. Outcome SHALL be `passed` when human retry or automatic scope
recertification refreshes the trusted done record and `requeued` when failed
verification returns the task to agent work. An automatic recertification's
event SHALL carry `automatic: true`; a human one SHALL carry no `automatic` key.

A passed recertification SHALL not advance execution attempts. A requeued
recertification SHALL retain the next execution attempt and failed verification
context in append-only state so a restarted watcher supplies them to the next
executor.

#### Scenario: Human recertification passes
- **WHEN** explicit retry verification exits zero for a scope-regressed task
- **THEN** one `recertification` event records `outcome: passed` without a retry, started event, or execution-attempt increment

#### Scenario: Human recertification requeues
- **WHEN** explicit retry verification exits non-zero or times out
- **THEN** one `recertification` event records `outcome: requeued` and preserves the next attempt and failing output for a later agent spawn

#### Scenario: Automatic recertification event
- **WHEN** the watcher recertifies a task automatically
- **THEN** one `recertification` event records `outcome: passed` and `automatic: true` without a retry, started event, or execution-attempt increment
