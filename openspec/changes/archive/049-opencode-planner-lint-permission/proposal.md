---
title: Opencode planner lint permission
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - watcher-and-harness
---
## Goal

`PLANNER.md` requires every planner to run `osq lint <slug>`, but the opencode
planner agent that `osq setup` generates denies `bash`, so an opencode planner
cannot follow its own protocol. Let that agent run `osq lint` and nothing else
in the shell, and use only permission keys OpenCode defines.

## Verify

`pnpm verify`

The suite proves the generated planner agent's permission map, its ordering, the
allowed and denied example commands under OpenCode's last-match-wins rule, and
byte-identical repeated setup, without a network service, TTY, or real model.

## Non-goals

- Making `osq setup` overwrite an existing planner agent file. It is created
  once and then belongs to the consumer.
- Changing the coder agent file or any other harness.
- Allowing the planner any shell command other than `osq lint`.

## Contract

### Requirement: Planner agent may lint and nothing else

The generated `.opencode/agent/osq-planner.md` SHALL allow `read`, `edit`,
`glob`, and `grep`, deny `webfetch` and `websearch`, and give `bash` an ordered
pattern map: deny `*`, then allow `osq lint*`, `pnpm osq lint*`, and
`npx osq lint*`, then deny any command containing a shell operator. OpenCode
applies the last matching rule, so a lint command chained to anything else is
denied. The file SHALL NOT use `write` or `git`, which are not OpenCode
permission keys.

#### Scenario: Lint is allowed
- **WHEN** the planner runs `osq lint 048` or `pnpm osq lint 048`
- **THEN** the last matching rule is an allow

#### Scenario: Chained or other commands are denied
- **WHEN** the planner runs `osq lint 048 && rm -rf x`, `osq lint 048; git push`, or `git status`
- **THEN** the last matching rule is a deny

#### Scenario: Repeated setup
- **WHEN** `osq setup` runs twice
- **THEN** the planner agent file is byte-identical and an existing file is never overwritten

## Human steps

- Review the proposal, the `cli-foundation` delta, and the task body, then run
  `pnpm osq approve 049` yourself.
- In each consumer project that already has `.opencode/agent/osq-planner.md`,
  delete it and run `osq setup` to pick up the new permissions.

## Delta

`specs/cli-foundation/spec.md` modifies `Opencode planner agent configuration`
to state the `bash` pattern map and drop the non-existent `write` and `git`
keys. Its source comment moves from the pre-047 `src/harness/opencode.ts` to
`src/harness/opencode/opencode.ts`.

One task; no file is shared.
