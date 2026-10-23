## MODIFIED Requirements

### Requirement: Config error exit
When any command rejects with a `ConfigLoadError` or a version-control
`NestedRootError`, the command line SHALL print `Error: <message>` to stderr,
without a stack trace, and set the exit code to 1 without ending the process.
`osq init` SHALL load config like every other command and SHALL NOT fall back
to the defaults. Any other error that is not a `CommandError` SHALL propagate
as before.

#### Scenario: Status with a broken config
- **WHEN** `osq status` runs in a project whose config fails to validate
- **THEN** stderr holds `Error: Failed to load ` and the file, and the exit code is 1

#### Scenario: Init with a broken config
- **WHEN** `osq init` runs in that project
- **THEN** it prints the same error, exits 1, and scaffolds nothing

#### Scenario: Doctor below the repository root with git on
- **WHEN** `osq doctor` runs through `runCli` in the folder `<outer>/sub` of version-control "Commands below the root with git on"
- **THEN** stderr is exactly `Error: ` followed by the message of version-control "Folder below the root with git on" and a newline, and the exit code is 1
