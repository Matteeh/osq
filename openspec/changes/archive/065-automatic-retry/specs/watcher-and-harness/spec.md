# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Automatic retry
<!-- source: src/watcher/auto-retry.ts, src/watcher/loop.ts, src/core/lifecycle/retry.ts, tests/auto-retry.test.ts -->
Each cycle, for every dead task in an approved change, the watcher SHALL retry
the task through `retrySpec` with `automatic: true` when its dead reason is
eligible, it is not stuck, and it has fewer automatic retries than
`gates.autoRetries` since the later of the manifest's `approvedAt` and its last
manual retry. Eligible reasons SHALL be `verify_red`, `change_verify_red`,
`undeclared_test_change`, `no_result`, `crashed`, and `timeout`.

#### Scenario: Retry fixes the task
- **WHEN** a task dies with `verify_red` and passes on its next attempt
- **THEN** it reaches done with exactly one `retry` event carrying `automatic: true`, and the watcher printed one automatic-retry line

#### Scenario: Ineligible reason
- **WHEN** a task dies with `spec_conflict`, `already_running`, or `verify_precondition`
- **THEN** it stays dead and no automatic `retry` event is appended

#### Scenario: Count exhausted
- **WHEN** a task that already had one automatic retry dies again with a new fingerprint and the count is 1
- **THEN** it stays dead until a human runs `osq retry`, after which it may be retried automatically once more

#### Scenario: Disabled
- **WHEN** `gates.autoRetries` is 0
- **THEN** no automatic retry happens, no task is marked stuck, and dead tasks behave as before

#### Scenario: Restart between death and retry
- **WHEN** the watcher stops after a death is recorded and before the retry, then starts again
- **THEN** the task is retried exactly once and runs once more

#### Scenario: Once mode
- **WHEN** `osq watch --once` performs an automatic retry
- **THEN** it continues and runs the retried task before exiting

### Requirement: Dead marker fingerprint
<!-- source: src/watcher/fingerprint.ts, src/watcher/outcome.ts, src/watcher/runner.ts, src/watcher/spawn.ts, src/watcher/loop.ts, tests/dead-fingerprint.test.ts -->
Every dead marker's frontmatter SHALL record `fingerprint: sha256:<hex>`,
hashed over the reason and the marker body after stripping ANSI codes and
replacing ISO timestamps, durations, PIDs, and absolute paths under the project
root with fixed placeholders.

#### Scenario: Volatile details
- **WHEN** two markers with the same reason differ only in timestamps, durations, PIDs, ANSI codes, or the project root path
- **THEN** their fingerprints are equal

#### Scenario: Different failures
- **WHEN** two markers differ in reason or in a failing test name
- **THEN** their fingerprints differ

### Requirement: Stuck task detection
<!-- source: src/watcher/auto-retry.ts, src/harness/types.ts, tests/auto-retry.test.ts -->
When automatic retry is enabled and a dead task's fingerprint equals the
fingerprint of its most recent retained dead marker, the watcher SHALL NOT retry
it automatically. It SHALL add `stuck: true` to the active marker, append one
`stuck` event with the task and fingerprint, and print one line, each once per
death. `osq retry` SHALL still retry a stuck task.

#### Scenario: Same failure twice
- **WHEN** a task dies twice with identical output
- **THEN** the second marker is stuck, one `stuck` event is appended, and no third attempt starts

## MODIFIED Requirements

### Requirement: Preserving retry transition
<!-- source: src/core/lifecycle/retry.ts, src/core/lifecycle/retry-transition.ts, src/core/status/layout.ts, src/core/run/scope-hash.ts, src/core/run/verification.ts, src/watcher/**, tests/retry*.test.ts -->
Retry SHALL be the sole transition that retires an active dead or regressed
marker, whether a human or the watcher requests it. It SHALL rename rather than
delete active artifacts using the next target-wide ordinal across retained dead
and regressed failures.

For a numeric `scope_regression` with an automated done marker, retry SHALL
first run the task verify under the configured timeout. A pass SHALL retain and
refresh canonical done while retiring only the regression marker. A failure
SHALL retain both regression and done under inactive attempt names so the task
derives pending. Other task regressions SHALL retain both artifacts and requeue
as before. A change-level retry SHALL accept literal `change` and make archive
verification eligible again.

#### Scenario: Dead marker retained
- **WHEN** a task's first active dead marker is retried
- **THEN** `dead/<n>.md` becomes `dead/<n>.1.md` and the task becomes pending without deleting diagnostics

#### Scenario: Scope regression passes recertification
- **WHEN** retry verification exits zero for an active scope regression
- **THEN** the regression marker is retained under its next ordinal while refreshed `done/<n>` remains canonical

#### Scenario: Scope regression fails recertification
- **WHEN** retry verification exits non-zero or times out for an active scope regression
- **THEN** both active regression and completion markers are retained under the same next ordinal and the task becomes pending

#### Scenario: Regressed completion retained
- **WHEN** a non-scope regressed numeric task has an active done marker
- **THEN** retry retains both failure and completion markers under inactive attempt names before the task runs again

#### Scenario: Change regression retained
- **WHEN** the change target is retried
- **THEN** `regressed/change.md` becomes its next attempt-suffixed historical marker

#### Scenario: Automatic retry uses the same transition
- **WHEN** the watcher retries a dead task automatically
- **THEN** the marker is retained under the same next ordinal as a manual retry would use and the approval check applies unchanged

### Requirement: Retry attempt lifecycle events
<!-- source: src/harness/types.ts, src/core/lifecycle/retry.ts, src/watcher/spawn.ts, tests/retry*.test.ts, tests/golden-events.test.ts -->
The lifecycle event union SHALL include a typed `retry` event carrying target,
reason, next execution attempt, and `automatic: true` when the watcher requested
it, and a typed `stuck` event carrying task and fingerprint. Every newly emitted
`started` event SHALL carry its execution attempt. Initial execution is attempt
1, and the first start after retry SHALL match the attempt in the preceding
retry event. Legacy started events without attempt SHALL remain readable.

#### Scenario: Initial attempt
- **WHEN** the runner spawns a task without retained failure history
- **THEN** its started event contains `attempt: 1`

#### Scenario: Retried attempt
- **WHEN** retry records the next attempt and the watcher later spawns the task
- **THEN** the target event stream contains retry followed by started with the same attempt

#### Scenario: Manual retry event
- **WHEN** a human runs `osq retry`
- **THEN** the `retry` event carries no `automatic` field

### Requirement: Retried executor context
<!-- source: src/harness/types.ts, src/harness/prompt.ts, src/watcher/attempt.ts, src/watcher/spawn.ts, tests/harness-prompt-injection.test.ts, tests/retry-attempts.test.ts -->
The runner SHALL reconstruct retry and requeued-recertification context from
append-only state and pass the attempt, failure reason, and failure output
through shared spawn options. After a manual or automatic retry of a dead task,
the output SHALL be the body of the dead marker that retry retained, with ANSI
codes stripped. Every textual harness prompt SHALL render one prior-context
section with the attempt, reason, output bounded at 2,000 characters, and
existing prior result. Retry SHALL NOT remove the result before spawn.

#### Scenario: Fresh process receives retry context
- **WHEN** the watcher restarts after ordinary retry and later spawns the task
- **THEN** the executor prompt identifies the retry attempt, retained failure reason, the retained marker's body, and prior result path

#### Scenario: Fresh process receives recertification failure
- **WHEN** the watcher restarts after failed recertification and later spawns the task
- **THEN** every textual harness prompt includes its next attempt and captured verification output without relying on process memory

#### Scenario: Automatic retry context
- **WHEN** the watcher retries a dead task automatically
- **THEN** the next prompt contains the retained marker's body exactly as after a manual retry
