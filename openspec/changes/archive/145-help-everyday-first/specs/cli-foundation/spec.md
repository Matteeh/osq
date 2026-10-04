## ADDED Requirements

### Requirement: Grouped root help
`osq --help` SHALL print, after the description, the line `Run osq with no
command first: it shows what needs you.`, then the options, then the commands
in four groups in this order, each headed `<title> commands:`:

- Everyday: `inbox`, `plan`, `approve`, `land`, `retry`, `reject`
- Setup and running: `init`, `setup`, `watch`
- Inspection: `status`, `show`, `report`, `digest`, `query`, `spec`, `graph`, `serve`, `doctor`
- Plumbing: `new`, `lint`, `queue`, `sync`, `message`, `migrate`

Each row SHALL keep commander's term and description.

#### Scenario: Root help groups
- **WHEN** a user runs `osq --help`
- **THEN** the output holds the bare-`osq` line, then `Everyday commands:` listing `inbox`, `plan`, `approve`, `land`, `retry` and `reject` in that order, then the other three groups in order, and no `Commands:` or `Other commands:` heading

### Requirement: Help groups cover every command
`COMMAND_GROUPS` in `src/cli/help-groups.ts` SHALL hold the groups, and
`configureGroupedHelp` there SHALL install the root help in `createProgram`.
Every registered command SHALL appear exactly once in the root help. A
registered command no group names SHALL print under `Other commands:`, and
`COMMAND_GROUPS` SHALL name every registered command, so that heading never
prints; a new command SHALL be added to a group. A subcommand's `--help` SHALL
print commander's default help, unchanged.

#### Scenario: Every command once
- **WHEN** the root help is printed for the program `createProgram` builds
- **THEN** each of its registered commands starts exactly one row, and `COMMAND_GROUPS` names exactly the registered commands

#### Scenario: Subcommand help unchanged
- **WHEN** a user runs `osq land --help`
- **THEN** the output is commander's default help for `land`, with no group heading and no bare-`osq` line

### Requirement: README command groups
README's `## Commands` section SHALL list the commands in the root help's
groups and order, each group a bold label of its title followed by one fenced
block whose lines start with `osq`. The Everyday block SHALL start with the
bare `osq` and `osq --json` lines. Every command in a group SHALL have at
least one line in that group's block.

#### Scenario: README follows the help
- **WHEN** README's `## Commands` section is read
- **THEN** it holds the four labels in order, and each command `COMMAND_GROUPS` names has a line `osq <command>` in its own group's block
