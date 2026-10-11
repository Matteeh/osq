---
title: README and descriptions call osq a spec-driven software factory
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

README's first line, the `package.json` description and `osq --help` still
open with "Strict spec queue.", and the README intro describes the early
design: small immutable task specs, a watcher handing each approved spec to an
agent, and a dead letter queue. It says nothing of briefs, living capability
specs, the validator, worktrees and land, or running osq on a server.

With this change, README line 3 and the `package.json` description say
`A spec-driven software factory. You write briefs and tap decisions; osq
plans, builds, verifies and lands each change against living specs.`, and
`osq --help` says, on one line, `Spec-driven software factory: you brief and
decide; osq lands verified changes.` The README intro walks the current flow
from brief to land, locally or on a server, and keeps the "If a fresh agent
could not pick up a task" line. The name stays `osq`, never spelled out, and
nothing calls osq a queue.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test (the new
`tests/readme-intro.test.ts` and the updated `tests/cli.test.ts`), and lint,
on the final tree.

## Non-goals

- Renaming the package, the binary, `osq.config.ts`, `~/.osq`, the `OSQ_*`
  variables, branch names or managed-block markers.
- Rewriting README sections below `## Install`; none of them repeats the old
  intro's claims.
- Changing `osq queue` or the brief queue; they keep their names.
- Changing the subcommand descriptions in `osq --help`.

## Surface

- Changed: the root command description in `osq --help`.
- Changed: the `description` in `package.json`.
- Changed: README's intro, before `## Install`.

## Decisions

- ADR 001: unchanged; no config loading is touched.
- ADR 004: unchanged; the OpenSpec validator is not touched.
- ADR 005: unchanged; no validator version check is touched.
- ADR 010: the intro calls the validator optional and says it reviews the
  change; it never says the validator stops one.
- ADR 012: unchanged; the watch service is not touched.
- ADR 015: unchanged; `osq mcp` is not touched.

## Assumptions

- The CLI line is shorter than the README sentence because commander wraps
  the root description at 80 columns when help is piped, and the brief asks
  for one line. It drops "plans, builds" and "against living specs" and keeps
  "software factory", the human's part and verified changes.
- The intro says "a tap from your phone" for approve, retry and land through
  `osq server start` and the dashboard over a private network, which the
  README's "Running osq on a server" section already describes.

## Contract

The cli-foundation delta below is the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: ADDED "Product description" and "README
  intro describes the flow".

One task owns every file; no file is shared between tasks.
