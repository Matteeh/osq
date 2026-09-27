## ADDED Requirements

### Requirement: Inbox wait log wiring
<!-- source: src/cli/inbox-dispatch.ts, tests/inbox-wait-log.test.ts -->
`inboxDispatchCommand` SHALL take `home`, defaulting to `os.homedir()`.
The card session SHALL run with a recorder from
`createWaitRecorder(cwd, 'cards', { home, stderr })` and `--follow` with one
from `createWaitRecorder(cwd, 'follow', { home, stderr })`, and both SHALL
get `home` in their watch options. The printed and `--json` output SHALL
read through `readDispatch` and `readDispatchQueue` with `home`, and SHALL
write nothing.

#### Scenario: Session writes the log
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` true, scripted key `q`, a temporary home, and a project with one approval item
- **THEN** the wait log under the temporary home holds `start`, a `seen` for the approval with `unobserved: true`, `top`, `opened`, and `stop`

#### Scenario: Follow writes the log
- **WHEN** it runs with `follow` and a temporary home, and the signal aborts after the first derivation
- **THEN** the wait log under the temporary home holds a `start` with mode `follow` and a `stop`

#### Scenario: Printing writes nothing
- **WHEN** it runs with `isTerminal` false, and again with `json`, under a temporary home
- **THEN** nothing exists under the temporary home's `.osq`

#### Scenario: Printed order uses first seen
- **WHEN** the wait log under the temporary home has the higher of two equal approval items first seen earlier
- **THEN** the printed list shows the higher change id first
