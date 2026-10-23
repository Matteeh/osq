## MODIFIED Requirements

### Requirement: Executor start
`run` SHALL start pi once through the runners kernel's `run_task` with
`PiHarness::from_config`, the executor role, no start retries, the task
timeout, the process environment and `executor_prompt` for the attempt
"Run attempts" gives. It appends `started` with that attempt, each harness
event, then `exited`. A failed start or a nonzero exit kills it as
`crashed`, a timeout as `timeout`, unless the result file was written
during the start. A usage limit fails the run without a marker.

#### Scenario: Executor exits
- **WHEN** a test runs the "Run outcomes" rows `crash` and `crash-after-result`
- **THEN** `.run/events/1.jsonl` holds a `started` event with the harness `pi` and attempt 1, then an `exited` event with exit code 3; `crash` dies as `crashed`, and `crash-after-result` has an `exit_continued` event after `exited` and is done

## ADDED Requirements

### Requirement: Run attempts
Before it starts pi, `run` SHALL read the task's retry context with
rust-storage `read_retry_context` of the change folder and the task, as
TypeScript's `spawnTaskAgent` does, and hand `executor_prompt` a
`PriorAttempt` holding that attempt, capped at `u32::MAX`, its reason and
its output. The `started` event's `attempt` is that attempt.

#### Scenario: Prior context handed to pi
- **WHEN** a test runs task `1` of a committed scratch copy of the run fixture, with `pi.bin` naming a fake pi that saves the prompt it is given outside the project and then does what the fake pi's `done` mode does, after writing the row's `.run/events/1.jsonl` lines and `.run/dead/` markers as "Retry contexts" in rust-storage writes them
- **THEN** the task is done, its `started` event has the row's attempt, the saved prompt equals `executor_prompt` of the fixture change and task `1` with a `PriorAttempt` of the row's attempt, reason and output, and the prompt's prior context is the row's:

| Run | Lines | Markers | Attempt | Prior context lines |
|---|---|---|---|---|
| first | no event file | none | 1 | none |
| after a retry | `retry 2` | `1.1.md` holding `<marker>` | 2 | `Prior Context:`, `- Prior Attempt: 2`, `- Prior Failure: verify_red`, `- Prior Failure Output:`, `  error: one` |
| after a requeued recertification | `requeued {"attempt":3,"reason":"scope_regression","output":"fail\n"}` | none | 3 | `Prior Context:`, `- Prior Attempt: 3`, `- Prior Failure: scope_regression`, `- Prior Failure Output:`, `  fail` |
