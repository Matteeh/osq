---
title: Init refresh schema
depends_on:
  - '051'
verify: pnpm verify
features:
  reads:
    - cli-foundation
---
## Goal

Let a consumer pick up the current osq OpenSpec schema with one command.

`osq init` never overwrites a file that already exists. So when osq ships a new
schema, like 051's single proposal format, an initialized project keeps the old
one. Today the only way to update it is to delete `openspec/config.yaml` and
`openspec/schemas/osq/` by hand and run `osq init` again. With
`osq init --refresh-schema`, it takes one command.

## Verify

`pnpm verify`

The suite scaffolds temporary projects and checks four things: the refresh
replaces stale schema files, reports files that already match as current
without rewriting them, and creates missing files. Plain `osq init` behaves and
prints exactly as before. None of it needs a network service, TTY, or real
model.

## Non-goals

- A doctor check for a stale scaffolded schema.
- Refreshing anything other than the six scaffolded OpenSpec files: not
  `osq.config.ts`, not `.env.example`, and not the managed blocks, which init
  already refreshes.
- Merging a consumer's edits into the new files. The refresh replaces them, and
  only when asked.
- Changing plain `osq init`.

## Contract

### Requirement: Scaffolded schema refresh

`osq init --refresh-schema` SHALL overwrite the scaffolded OpenSpec schema files
from the installed templates and report each file it replaced. Files that
already match SHALL stay untouched. Without the flag, `osq init` SHALL behave
exactly as before.

#### Scenario: Stale consumer schema
- **WHEN** a consumer's `openspec/schemas/osq/templates/proposal.md` differs from the installed template and they run `osq init --refresh-schema`
- **THEN** the file equals the installed template and init prints it as `refreshed`

#### Scenario: Current schema
- **WHEN** every scaffolded schema file already matches the installed templates
- **THEN** `osq init --refresh-schema` rewrites none of them and prints each as `current`

#### Scenario: Plain init
- **WHEN** `osq init` runs without the flag on an initialized project
- **THEN** it reports the schema files as `exists` and leaves them unchanged

## Human steps

- Review the proposal, the delta, and the task, then run
  `pnpm osq approve 052` yourself.
- This replaces 051's human step for consumer projects. Instead of deleting the
  schema files and rerunning init, run `pnpm osq init --refresh-schema`, or
  `npx @matteeh/osq init --refresh-schema` where osq isn't a pnpm dependency.
  The refresh overwrites local edits to those files, including custom
  `config.yaml` rules, so commit or review the diff first.

## Delta

- `specs/cli-foundation/spec.md` adds `Scaffolded schema refresh`.

One task owns every file. No file is shared.
