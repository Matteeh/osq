---
title: Config errors fail loudly
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
---
## Goal

A broken `osq.config.ts` stops osq with a clear error instead of silently
falling back to the defaults. `loadConfig` throws an error naming the file and
the original message, every command prints it and exits 1, and doctor's
`config` check fails with it. A config file's `import ... from '@matteeh/osq'`
resolves to the running osq, so a project without osq in its own
`node_modules`, such as one using a global install, keeps loading the config
that `osq init` wrote instead of starting to fail.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests prove that a
config which fails to import or validate rejects with the file and message,
that the scaffolded config loads in a project with no `node_modules`, that a
project with no config loads the defaults, that doctor fails its `config`
check, and that `status` and `init` print the error and exit 1. Every existing
test passes unchanged.

## Non-goals

- New validation rules.
- The harness adapters' own fallbacks when they load config without a caller's
  config; they already receive the command's config.
- Aliasing `@matteeh/osq/testing`, which no config file imports.

## Surface

- Changed: every command exits 1 with `Error: Failed to load <path>: <message>` when a config file exists but fails to import or validate, where it used to continue with the defaults (command behaviour)
- Changed: `osq init` fails the same way instead of scaffolding with the defaults (command behaviour)
- Changed: a config file's `@matteeh/osq` import resolves to the running osq (config loading)
- Removed: the `DEBUG_OSQ` warning when a config file fails to load (environment variable)

## Decisions

- ADR 001: the config file still loads through jiti; the change adds only jiti's `alias` option.
- ADR 004: no validator call changes.
- ADR 005: no version check moves.

## Background

`loadConfig` in `src/core/foundation/config.ts` catches every error from the
jiti import, logs only under `DEBUG_OSQ`, and continues with an empty user
config. `defineConfig` validates at import time inside the config file, so its
errors land in that catch too. Reported by change 086's executor.

A trial on `5a2bee7` that only threw from the catch broke three test files:
`tests/status.test.ts`, `tests/plan-approve-next-step.test.ts`, and
`tests/codex/adapter.test.ts`. Each scaffolds a temporary project with
`osq init`'s config, whose `import { defineConfig } from '@matteeh/osq'` cannot
resolve there, so today those projects silently run on the defaults. A user
with a global install hits the same thing. Adding jiti's
`alias: { '@matteeh/osq': <running osq's entry> }` made all three pass, and the
full suite then broke only `tests/package-root.test.ts`, which allows
`new URL(..., import.meta.url)` only in `src/core/foundation/package-root.ts`.
The entry path therefore comes from there.

`config.ts` has 244 of 250 lines. `src/cli/bin.ts` has no error handling, so a
rejected command today prints a stack trace.

## Contract

### Requirement: No config file still loads the defaults
A project with no `osq.config.ts`, `.js`, or `.mjs` SHALL load
`DEFAULT_CONFIG` merged with the environment, as before.

#### Scenario: Empty project
- **WHEN** `loadConfig` runs in an empty temporary folder
- **THEN** it resolves to the default harness, limits, and timeouts

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Config file errors" and "Config error exit".

Two tasks, and no file is shared. Task 1 owns loading and the alias; task 2
owns what the command line does with the error.
