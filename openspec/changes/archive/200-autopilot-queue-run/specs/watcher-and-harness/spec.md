## ADDED Requirements

### Requirement: Autopilot pass
With `autopilot.enabled` and autopilot commands given, the watcher SHALL take
autopilot's next step once after each cycle, in `osq watch` and `--once`
alike. `plan-next` calls `planNext` and writes the new change's marker;
`plan` adds `planner_started_at` and calls `plan`; `approve` adds
`approved_at` and calls `approve`; `land` calls `land`. A `--once` run SHALL
keep cycling while a step was taken. Without `autopilot.enabled` the watcher
reads and writes no autopilot file.

#### Scenario: Approved queue lands in order
- **WHEN** a queue of three items, each depending on the one before, is approved and the watcher runs with autopilot on, a planner that leaves a lint-green plan, and tasks that pass
- **THEN** the default branch gains one `osq: <id> ` commit per item in queue order, each archived change holds `.run/autopilot.md` with the queue approval's hash and an `approved_at`, and no stop record exists

#### Scenario: Autopilot off
- **WHEN** the same queue is approved and the watcher runs with autopilot off
- **THEN** no change folder is created and no file appears under `openspec/.run/` besides the queue approval

#### Scenario: Restart mid-queue
- **WHEN** the watcher stops after the first item lands and a new watcher with new autopilot commands runs
- **THEN** the second and third items land and the first is not planned again

### Requirement: Autopilot stops
A `stop` step SHALL write the stop record unless one with the same reason,
item, change and command exists. A command that throws SHALL write a stop:
`plan_refused` with `osq plan --next`, `planner_not_ready` with
`osq plan <id>`, `approve_refused` with `osq approve <id>`, or `land_stopped`
with `osq land <id>`. Its detail is the error's message, or `exit code <n>`
when the message is empty. Every step taken and every stop written logs one
line starting `autopilot: `.

#### Scenario: Edited item stops the queue
- **WHEN** the second of three approved items is edited after `osq queue approve` and the watcher runs with autopilot on
- **THEN** the first item lands, the stop record names the second item with reason `changed_since_approval` and command `osq queue approve`, and after `osq queue approve` the watcher lands the second and third

#### Scenario: Planner not ready stops the queue
- **WHEN** the planner leaves the first item's plan lint red
- **THEN** the stop record holds reason `planner_not_ready`, the change's id and command `osq plan <id>`, and the next watcher run starts no planner

#### Scenario: A failed land with an exit code
- **WHEN** the `land` command throws a `CommandError` with an empty message and exit code 1
- **THEN** the stop record's detail is `exit code 1`

### Requirement: Autopilot stop holds
While a stop record names the same item and change, the watcher SHALL not
take a `plan-next`, `plan`, `approve` or `land` step. Any other step, or a
step for another item or change, SHALL remove the record first, so the queue
moves on once a human changes the state it stopped on.

#### Scenario: A stopped land is not retried
- **WHEN** the `land` command throws `land refused` for an archived change
- **THEN** the stop record holds reason `land_stopped`, detail `land refused` and command `osq land <id>`, and the next pass calls no command

#### Scenario: A human's step clears the stop
- **WHEN** a `halted` stop is recorded and a human's `osq retry` puts the change back to running
- **THEN** the next pass removes the stop record and takes no step
