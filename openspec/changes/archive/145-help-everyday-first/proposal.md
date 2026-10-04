---
title: osq --help shows the everyday commands first
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

`osq --help` lists the commands in four named groups, everyday first, so a new
user sees the loop (plan, approve, land, and steering when osq asks) before
setup, inspection and plumbing. A line above the options says to run bare
`osq` first, because it shows what needs you. No command is removed, renamed
or changed, and each command's own `--help` stays byte-identical. README's
`## Commands` section follows the same groups.

Today `osq --help` prints 24 commands in one flat `Commands:` list in
registration order, and `approve` and `land` come near the end.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint. The new
`tests/help-groups.test.ts` proves the root help prints every registered
command exactly once under its group, in group order, with the bare-`osq`
line, and that subcommand help carries none of it. The new
`tests/readme-command-groups.test.ts` proves README's command list holds the
same groups.

## Non-goals

- Removing, renaming, hiding, or changing any command or option.
- Changing any subcommand's own `--help` output.
- Upgrading commander.
- Changing what bare `osq` does.

## Surface

- Changed: `osq --help` prints the commands under `Everyday commands:`, `Setup and running commands:`, `Inspection commands:` and `Plumbing commands:` instead of one `Commands:` list, and adds the line `Run osq with no command first: it shows what needs you.` after the description.
- Changed: README's `## Commands` section is grouped the same way, and gains the `osq land`, `osq sync` and `osq query` lines it lacked.

## Decisions

- ADR 001: unaffected; no configuration loading changes.
- ADR 004: unaffected; the OpenSpec validator is not touched.
- ADR 005: unaffected; the validator peer range is not touched.

## Contract

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
registered command no group names SHALL print under `Other commands:`, and the
groups SHALL name every registered command, so that heading never prints; a
new command SHALL be added to a group. A subcommand's `--help` SHALL print
commander's default help, unchanged.

#### Scenario: Every command once
- **WHEN** the root help is printed for the program `createProgram` builds
- **THEN** each of its registered commands starts exactly one row, and the groups name exactly the registered commands

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

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` in this checkout, because the globally linked `osq` runs `dist/`.

## Delta

- `specs/cli-foundation/spec.md`: adds "Grouped root help", "Help groups cover every command" and "README command groups".

Two tasks. Task 2 imports `COMMAND_GROUPS` from task 1's `src/cli/help-groups.ts` and edits no file task 1 owns.

## Background

**Group choices.** The ROADMAP's "A simple surface" principle names the
everyday commands as bare `osq`, `plan`, `approve`, `land`, `retry` and
`reject`; setup as `init` and `setup`; inspection as `status`, `show`,
`report`, `graph`, `serve` and `doctor`; plumbing as `lint`, `new`, `queue`
and `migrate`. The commands it doesn't name:

- `inbox` is everyday: it is the card session over the same items bare `osq` lists, and its keys run approve, plan, retry and reject.
- `watch` joins setup, in a group renamed "Setup and running": it is started once and left running, and the roadmap makes it a background service.
- `digest`, `query` and `spec` are inspection: each only reads.
- `sync` is plumbing: since 110 the watcher and `osq land` sync on their own.
- `message` is plumbing: it prints the land commit message, which `osq land` now builds itself.

**Commander stays at 13.1.0.** Command groups (`helpGroup`) arrived in
commander 14. Commander 13's `configureHelp({ formatHelp })` is enough: a
prototype on 2026-10-04 overrode `formatHelp` on the root program only, built
the rows with commander's own `Help` methods (`padWidth`, `formatItem`,
`subcommandTerm`, `subcommandDescription`, `visibleOptions`,
`visibleCommands`), and fell back to `Help.prototype.formatHelp` for every
other command. Upgrading would change the lockfile, need a network install no
executor can run, and spread group names over the ten files that register
their own commands.

**Measured on 2026-10-04** with that prototype in a scratch worktree: the whole
`tests/**/*.test.ts` suite passed (3,194 tests), and all 24 subcommands'
`helpInformation()` output was byte-identical to main's. No preexisting test
pins the root command list's layout: `tests/bin-execution.test.ts` only
matches command names in `--help`, and `tests/cli.test.ts` only checks the
description. `tests/web-graph-command.test.ts` matches README lines starting
`osq graph` and `osq graph --json`, which the grouped list keeps. `src/cli/index.ts`
is 240 lines, so wiring the help in adds two lines and stays under the line
budget; `createProgram` is on the function budget's grandfather list, which
allows it to grow.
