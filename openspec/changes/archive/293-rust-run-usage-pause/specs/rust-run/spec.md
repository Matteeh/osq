## MODIFIED Requirements

### Requirement: Executor start
`run` SHALL start pi once through the runners kernel's `run_task` with
`PiHarness::from_config`, the executor role, no start retries, the task
timeout, the process environment and `executor_prompt` for the attempt
"Run attempts" gives. It appends `started` with that attempt, each harness
event, then `exited`. A failed start or a nonzero exit kills it as
`crashed`, a timeout as `timeout`, unless the result file was written
during the start. A usage limit pauses it as "Run usage pause" says.

#### Scenario: Executor exits
- **WHEN** a test runs the "Run outcomes" rows `crash` and `crash-after-result`
- **THEN** `.run/events/1.jsonl` holds a `started` event with the harness `pi` and attempt 1, then an `exited` event with exit code 3; `crash` dies as `crashed`, and `crash-after-result` has an `exit_continued` event after `exited` and is done

## ADDED Requirements

### Requirement: Run usage pause
`run` SHALL give the runner a `usage_limit_wait` of 1800 seconds,
TypeScript's default `gates.usageLimitWaitSeconds`. When `run_task`
returns `Paused`, `run` SHALL append the start's events, the runner's
`paused` event last among them, and write `<change folder>/.run/paused.md`
as TypeScript's `writeUsagePause` does:
`---\ntask: "<task>"\nuntil: "<until>"\nsource: "<source>"\n---\n<body>\n`,
with the pause's task, until and source, and a body of the limit's error,
or `usage limit reached` without one. It SHALL write no `exited` event, no
dead marker and no done marker, run no audit and no verify, release the
task's lock, and fail with `task <task> of <folder> paused on a usage
limit`. A paused run writes no `retry` or `recertification` event, so the
next run of the task starts the same attempt.

#### Scenario: Paused on a usage limit
- **WHEN** a test runs `run` with the arguments `1`, `1` twice, one run after the other, on a copy of the run fixture made as "Run outcomes" says, except that `pi.bin` names a fake pi that prints the line `{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"429 Monthly usage limit reached"}}` and exits 1
- **THEN** each run fails with `run failed: task 1 of 001-a paused on a usage limit`; after each run the events after the last `started` event in `.run/events/1.jsonl` are exactly a `usage_limit` event with `error` `429 Monthly usage limit reached` and then a `paused` event with task `1`, source `wait`, that error and an `until` no earlier than rust-runners `pause_until` of a limit without a reset time, the time just before the run and 1800 seconds, and no later than the same for the time just after it; both `started` events have attempt 1; `.run/paused.md` equals `---\ntask: "1"\nuntil: "<until>"\nsource: "wait"\n---\n429 Monthly usage limit reached\n` with the last `paused` event's until, and rust-storage `read_usage_pause` reads that task, until, source and error from it; and `.run/dead/1.md`, `.run/done/1` and `.run/running/1.pid` do not exist
