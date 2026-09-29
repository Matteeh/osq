## ADDED Requirements

### Requirement: Sync command
<!-- source: src/cli/sync.ts, src/cli/index.ts, tests/vcs-sync-command.test.ts -->
`osq sync <id>` SHALL run `syncChange` for the id in the current directory,
print its line to stdout, and exit zero. It SHALL pass `syncChange` a progress
callback that prints each progress line to stderr, so stdout holds only the
result. On a refusal or a stop it SHALL print only the message to stderr and
exit one. `syncCommand` in `src/cli/sync.ts` SHALL take injectable `cwd`,
`config`, `stdout`, `stderr`, and `exit`, as `landCommand` does, and SHALL
load `osq.config.ts` inside its error handling, so a configuration error
prints its message and exits one. `createProgram` SHALL register it through
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
