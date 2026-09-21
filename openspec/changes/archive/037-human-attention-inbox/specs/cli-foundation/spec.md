# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Bare command inbox entrypoint
<!-- source: src/cli/index.ts, src/cli/inbox.ts, tests/inbox.test.ts, tests/cli.test.ts -->
The root CLI SHALL execute the human attention inbox when invoked without a
subcommand instead of printing Commander help. The root SHALL accept `--json`
to select the inbox JSON representation. Help, version, named subcommands, and
subcommand-local options including `report --json` SHALL retain their existing
dispatch and behavior.

#### Scenario: Bare text invocation
- **WHEN** a user executes `osq` with no subcommand or root options
- **THEN** the root action prints the text inbox and does not print Commander help

#### Scenario: Bare JSON invocation
- **WHEN** a user executes `osq --json`
- **THEN** the root action prints only the stable inbox JSON object

#### Scenario: Explicit command invocation
- **WHEN** a user executes `osq status`, `osq report --json`, help, version, or another registered subcommand
- **THEN** Commander dispatches the existing command without running or advancing the inbox
