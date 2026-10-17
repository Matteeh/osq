## ADDED Requirements

### Requirement: Autopilot configuration
`osq.config.ts` MAY hold an `autopilot` block whose only key is `enabled`, a
boolean that defaults to `false`. Without the block the loaded config SHALL
have no `autopilot` key. Any other key, a block that is not an object, or an
`enabled` that is not a boolean SHALL fail loading with the error the table
names.

#### Scenario: Autopilot values
- **WHEN** `defineConfig` receives this `autopilot` value
- **THEN** the loaded config's `autopilot` is this result, or loading throws this error

| value | result |
| --- | --- |
| absent | no `autopilot` key |
| `{}` | `{ enabled: false }` |
| `{ enabled: true }` | `{ enabled: true }` |
| `{ enabled: false }` | `{ enabled: false }` |
| `{ enabled: 'yes' }` | error `autopilot.enabled must be a boolean` |
| `{ maxSteers: 2 }` | error `autopilot.maxSteers is not supported` |
| `true` | error `autopilot must be an object` |

### Requirement: Queue approve command
`osq queue approve` SHALL read the queue, write the queue approval record,
remove any autopilot stop record, and print
`Approved <n> queue items (<hash>)`. Without `autopilot.enabled` it SHALL then
print `Autopilot is off; set autopilot.enabled in osq.config.ts to run the queue`.
A queue it cannot read SHALL fail with `Queue error: <message>` and change no
file. With `OSQ_SERVER` set it SHALL refuse with the local-only line.

#### Scenario: Queue approved
- **WHEN** `osq queue approve` runs on a queue of two items with autopilot off
- **THEN** it prints `Approved 2 queue items (<hash>)` with the record's hash, then `Autopilot is off; set autopilot.enabled in osq.config.ts to run the queue`, and the record names both items

#### Scenario: Queue approve clears a stop
- **WHEN** `osq queue approve` runs with autopilot on while an autopilot stop record exists
- **THEN** the stop record is gone and the output has no `Autopilot is off` line

#### Scenario: Unreadable queue is not approved
- **WHEN** `osq queue approve` runs on a queue whose item has no `Depends on:` line
- **THEN** it fails with a message starting `Queue error: ` and neither record file changes

#### Scenario: Queue approve against a server
- **WHEN** the program forwarded to a server runs `osq queue approve`
- **THEN** it fails with `osq queue approve runs only locally; unset OSQ_SERVER to run it here, or run it on the server` and writes nothing

### Requirement: Autopilot commands
The watcher SHALL get autopilot's commands from the CLI as the command
functions themselves: `planNext` runs `osq plan --next`, `plan` runs
`osq plan <id> --run`, `approve` runs `osq approve <id>` with no override flag,
and `land` runs `osq land <id>`. Each throws what its command throws, and
their output is not printed. `osq watch` SHALL pass them to the watcher in
every mode.

#### Scenario: Autopilot runs the command functions
- **WHEN** the watcher runs an approved queue of three items with autopilot on and the commands `createAutopilotCommands` builds
- **THEN** each item's change was created with the item's `queue_item` and `queue_hash` on its brief, holds a `.run/plan-run.md` with outcome `ready`, and landed as one commit on the default branch whose subject starts `osq: <id> `
