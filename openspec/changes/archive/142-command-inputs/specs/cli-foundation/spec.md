## ADDED Requirements

### Requirement: Command inputs
`src/cli/command-inputs.ts` SHALL export `Writer`, a function that receives
exactly the text a command prints, newlines included; `CommandInputs`, with
optional `cwd`, `config`, `stdout` and `stderr`; `processStdout` and
`processStderr`, the writers to the process streams; `resolveInputs`, which
fills `cwd` with `process.cwd()` and each missing writer with its process
writer, and gives `config()`, the passed config or `loadConfig(cwd)`; and
`commandLogger`, the `osq` logger at a level, writing to the process stderr
when no `stderr` is passed and to the passed `stderr` otherwise. Every
exported command function under `src/cli/` SHALL accept `CommandInputs` in
its options, with those names and meaning.

#### Scenario: Captured in-process
- **WHEN** a caller awaits `statusCommand({ cwd, config, stdout, stderr })`
- **THEN** `stdout` receives the text `osq status` prints in `cwd`, ending in a newline, and nothing reaches the process streams

#### Scenario: Same bytes by default
- **WHEN** `osq status`, `osq report` or `osq doctor` runs through `runCli`
- **THEN** stdout, stderr and the exit code are the same as when the command is called directly with writers that append to strings

### Requirement: Commands print through their inputs
A command SHALL print only through its `stdout` and `stderr`, or through a
logger from `commandLogger`, and SHALL pass its writers to every helper and
core seam that prints for it. When a caller passes none of the inputs, the
command SHALL print the same bytes, on the same streams, in the same order,
and exit with the same code as before. No file under `src/cli/` other than
`command-inputs.ts` SHALL call `console.*`, `process.stdout.write` or
`process.stderr.write`; `runCli` prints through `processStdout` and
`processStderr`.

#### Scenario: Logger output captured
- **WHEN** a caller awaits `lintCommand([id], { cwd, config, stderr })` on a change with an error finding
- **THEN** `stderr` receives the finding lines, and the command rejects with a `CommandError` with an empty message

#### Scenario: No direct output
- **WHEN** every file under `src/cli/` other than `command-inputs.ts` is read
- **THEN** none contains `console.`, `process.stdout.write` or `process.stderr.write`

## MODIFIED Requirements

### Requirement: Land command
`osq land <id>` SHALL run `landChange` for the id in the current directory,
print each of its lines to stdout, and exit with its code. It SHALL pass
`landChange` a progress callback that prints each progress line to stderr, so
stdout holds only the land's result. On a refusal or a stop it SHALL print
only the message to stderr and exit one. `landCommand` SHALL take the command
inputs, as `messageCommand` does, and SHALL load `osq.config.ts` inside its
error handling, so a configuration error prints its message and exits one. `createProgram` SHALL register it through
`registerLandCommand`, and the `doctor` command through
`registerDoctorCommand` in `src/cli/doctor.ts`, with its description and
behaviour unchanged.

#### Scenario: Land prints its lines
- **WHEN** `osq land <id>` lands an archived change
- **THEN** stdout holds `Landed <folder> as <commit>`, `Removed worktree <path>`, and `Kept branch osq/<folder>`, in that order and nothing else, and the exit code is zero

#### Scenario: Refusal on stderr
- **WHEN** `osq land <id>` refuses
- **THEN** stdout is empty, stderr holds the refusal, and the exit code is one

#### Scenario: Registered commands
- **WHEN** `osq --help` runs
- **THEN** it lists `land <id>` and `doctor`

#### Scenario: Progress on stderr
- **WHEN** `osq land <id>` syncs because the default branch moved
- **THEN** the sync's progress line is on stderr, and stdout holds only the land's result lines

### Requirement: Sync command
`osq sync <id>` SHALL run `syncChange` for the id in the current directory,
print its line to stdout, and exit zero. It SHALL pass `syncChange` a progress
callback that prints each progress line to stderr, so stdout holds only the
result. On a refusal or a stop it SHALL print only the message to stderr and
exit one. `syncCommand` in `src/cli/sync.ts` SHALL take the command inputs,
as `landCommand` does, and SHALL load `osq.config.ts` inside its error
handling, so a configuration error prints its message and exits one. `createProgram` SHALL register it through
`registerSyncCommand` with the description `merge the default branch into a
change's branch`.

#### Scenario: Sync prints its line
- **WHEN** `osq sync <id>` merges the default branch into an active change's branch
- **THEN** stdout holds only `Synced osq/<folder> with main`, stderr holds the progress line, and the exit code is zero

#### Scenario: Sync refusal on stderr
- **WHEN** `osq sync <id>` runs with `vcs.enabled` off
- **THEN** stdout is empty, stderr holds `osq sync needs vcs.enabled and git`, and the exit code is one

#### Scenario: Sync is registered
- **WHEN** `osq --help` runs
- **THEN** it lists `sync <id>`
