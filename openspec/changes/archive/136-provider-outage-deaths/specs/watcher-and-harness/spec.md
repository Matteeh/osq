## ADDED Requirements

### Requirement: Provider outage deaths
A task attempt's events SHALL be those after its last `started` event. When the
agent of an attempt crashes or times out while the attempt holds a
`harness_retry` start with no later `harness_retry` end carrying
`success: true`, the task SHALL die with reason `provider_unavailable`. Its
dead marker body SHALL read `The model provider did not answer: <error>`, with
the error of the latest such start, or `no error reported` when none carried
one. Every other crash or timeout SHALL keep its reason.

#### Scenario: Provider never answered
- **WHEN** an attempt holds a `harness_retry` start with DeepSeek's error and no successful end, and the agent times out
- **THEN** the task dies with `provider_unavailable`, a `dead` event carries that reason, and the marker quotes DeepSeek's error

#### Scenario: Provider recovered before the timeout
- **WHEN** an attempt holds a `harness_retry` start followed by an end with `success: true`, and the agent later times out
- **THEN** the task dies with `timeout`

### Requirement: Provider stall stop
While a task runs, the watcher SHALL stop its agent with SIGTERM once the
attempt's open provider retry has lasted `gates.providerStallSeconds`, checking
at least every `log.heartbeatSeconds` when that is positive. A value of 0 SHALL
turn the early stop off.

#### Scenario: Stalled task stopped early
- **WHEN** an attempt's open provider retry started longer ago than `gates.providerStallSeconds` and the agent is still running
- **THEN** the watcher stops the agent before the task timeout, and the task dies with `provider_unavailable`

### Requirement: Provider outage retries
A task that died with `provider_unavailable` SHALL be retried automatically
once `gates.providerRetryDelaySeconds` have passed since its latest `dead`
event, up to `gates.providerRetries` such retries since the later of the
manifest's `approvedAt` and its last manual retry. They SHALL NOT count toward
`gates.autoRetries`, and `gates.autoRetries: 0` SHALL turn them off too.

#### Scenario: Waits, then retries
- **WHEN** a task dies with `provider_unavailable`
- **THEN** no `retry` event is appended before the delay has passed, and one automatic `retry` event with reason `provider_unavailable` is appended after it

#### Scenario: Separate budget
- **WHEN** a task with `gates.autoRetries` of 1 dies twice with `provider_unavailable` and `gates.providerRetries` is 3
- **THEN** it is retried automatically both times, and a later `verify_red` death still gets its one automatic retry

#### Scenario: Budget exhausted
- **WHEN** a task has had `gates.providerRetries` automatic provider retries and dies with `provider_unavailable` again
- **THEN** it stays dead until a human runs `osq retry`

## MODIFIED Requirements

### Requirement: Stuck task detection
When automatic retry is enabled and a dead task's fingerprint equals the
fingerprint of its most recent retained dead marker, the watcher SHALL NOT retry
it automatically. It SHALL add `stuck: true` to the active marker, append one
`stuck` event with the task and fingerprint, and print one line, each once per
death. `osq retry` SHALL still retry a stuck task. A task whose active dead
reason is `provider_unavailable` SHALL never be marked stuck.

#### Scenario: Same failure twice
- **WHEN** a task dies twice with identical output
- **THEN** the second marker is stuck, one `stuck` event is appended, and no third attempt starts

#### Scenario: Same provider outage twice
- **WHEN** a task dies twice with `provider_unavailable` and the same provider error
- **THEN** no marker is stuck and no `stuck` event is appended
