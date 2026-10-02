## MODIFIED Requirements

### Requirement: Command errors
`src/cli/command-error.ts` SHALL export `CommandError`, an `Error` named
`CommandError` with a readonly `exitCode`, default 1, and a readonly `next`
step or `undefined`. No file under `src/cli/` SHALL call `process.exit`, no
file under `src/cli/` other than `run.ts` SHALL set `process.exitCode`, and no
command SHALL take an `exit` option. Where a command fails, it SHALL throw a
`CommandError` with the exit code it fails with. When it printed a plain error
line to stderr, the message SHALL be exactly that line; when it printed its
failure through the logger or as a report, or printed none, the message SHALL
be empty and the command SHALL keep printing as before. The command SHALL NOT
print the message or the next step itself.

#### Scenario: Caller carries on
- **WHEN** a caller awaits `showCommand('999')` in a project without change 999
- **THEN** it rejects with a `CommandError` whose message is `Show error: Spec "999" not found in specs or archive` and whose exit code is 1, nothing is printed, and the caller keeps running

#### Scenario: Several ids stop at the first failure
- **WHEN** `osq approve A B` runs and approving A fails
- **THEN** the command fails with A's error and B is not approved

#### Scenario: No command ends the process
- **WHEN** every file under `src/cli/` is read
- **THEN** none contains `process.exit(`

#### Scenario: No command sets the exit code
- **WHEN** every file under `src/cli/` other than `run.ts` is read
- **THEN** none assigns `process.exitCode`, and none declares an `exit` option

#### Scenario: Failing lint leaves the caller running
- **WHEN** a caller awaits `lintCommand` on a change with an error finding
- **THEN** the findings print as before, it rejects with a `CommandError` with an empty message and exit code 1, and `process.exitCode` is unchanged

#### Scenario: Land refusal
- **WHEN** a caller awaits `landCommand` for an id with no archived change
- **THEN** it rejects with a `CommandError` whose message is the refusal line `osq land` printed to stderr before, and nothing is printed

#### Scenario: Planner exit code
- **WHEN** the planner session `planCommand` launched exits 3
- **THEN** `planCommand` rejects with a `CommandError` with an empty message and exit code 3, and `osq plan` exits 3
