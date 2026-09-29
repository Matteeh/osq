## ADDED Requirements

### Requirement: Command errors
`src/cli/command-error.ts` SHALL export `CommandError`, an `Error` named
`CommandError` with a readonly `exitCode`, default 1, and a readonly `next`
step or `undefined`. No file under `src/cli/` SHALL call `process.exit`.
Where a command printed an error and ended the process, it SHALL throw a
`CommandError` there instead, whose message is exactly the text it printed to
stderr, or empty when it printed none. The command SHALL NOT print the message
or the next step itself.

#### Scenario: Caller carries on
- **WHEN** a caller awaits `showCommand('999')` in a project without change 999
- **THEN** it rejects with a `CommandError` whose message is `Show error: Spec "999" not found in specs or archive` and whose exit code is 1, nothing is printed, and the caller keeps running

#### Scenario: Several ids stop at the first failure
- **WHEN** `osq approve A B` runs and approving A fails
- **THEN** the command fails with A's error and B is not approved

#### Scenario: No command ends the process
- **WHEN** every file under `src/cli/` is read
- **THEN** none contains `process.exit(`

### Requirement: Command error output
`runCli` SHALL catch a `CommandError`, print a non-empty message to stderr,
then print `Next: <next>` to stdout when `next` is set, and set
`process.exitCode` to its `exitCode` without ending the process. Any error
that is neither a `CommandError` nor a `ConfigLoadError` SHALL propagate from
`runCli` as before. Every command SHALL print the same text on the same
streams, in the same order, and exit with the same code as before.

#### Scenario: Refusal on the command line
- **WHEN** `osq show 999` runs in a project without change 999
- **THEN** stderr holds exactly `Show error: Spec "999" not found in specs or archive`, stdout is empty, the exit code is 1, and `process.exit` is never called

#### Scenario: Failed check
- **WHEN** `osq check 012` runs a recorded check that exits 3
- **THEN** stdout holds `Exit code: 3` and the next step, stderr is empty, and the exit code is 1

## MODIFIED Requirements

### Requirement: Config error exit
When any command rejects with a `ConfigLoadError`, the command line SHALL print
`Error: <message>` to stderr, without a stack trace, and set the exit code to
1 without ending the process. `osq init` SHALL load config like every other
command and SHALL NOT fall back to the defaults. Any other error that is not a
`CommandError` SHALL propagate as before.

#### Scenario: Status with a broken config
- **WHEN** `osq status` runs in a project whose config fails to validate
- **THEN** stderr holds `Error: Failed to load ` and the file, and the exit code is 1

#### Scenario: Init with a broken config
- **WHEN** `osq init` runs in that project
- **THEN** it prints the same error, exits 1, and scaffolds nothing

### Requirement: Approve refusal next step
When `osq approve <id>` fails for a change whose folder exists, the
`CommandError` it throws SHALL carry that change's next step as `next`, so
`runCli` prints `Next: <next step>` to stdout after the error. When the folder
does not exist, `next` SHALL be unset and no `Next:` line SHALL print.

#### Scenario: Approving a template
- **WHEN** `osq approve 021` runs on a change that still has the placeholder verify
- **THEN** it fails and prints `Next: unplanned — osq plan 021`

#### Scenario: Error before the next step
- **WHEN** `osq approve 021` fails that way
- **THEN** its `Error approving 021:` line on stderr is printed before its `Next:` line on stdout
