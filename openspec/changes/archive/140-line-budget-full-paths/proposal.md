---
title: The line budget exempts files by full path
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

`tests/line-budget.test.ts` exempts only the exact files on its allow list, so
a new file over 250 lines fails however it is named, and the list can only
shrink.

Today the test skips any file whose basename is on `ALLOW_LIST`. So
`src/cli/report.ts` (352 lines) passes only because it shares a name with
`src/core/report/report.ts`, and any future `types.ts`, `parser.ts`, or
`loop.ts` anywhere under `src/` is exempt. Under ADR 006 a gate either blocks
or goes.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/line-budget-check.test.ts` proves the matching and the shrink rule over
temporary source trees, and `tests/line-budget.test.ts` runs the same check on
the real `src/`.

## Non-goals

- Splitting any file.
- The function budget, which already keys by path and function name.
- The UI line budget in the same test file, which has no allow list.

## Surface

None

## Decisions

- ADR 002: unaffected; archive applies this delta like any other.

## Contract

### Requirement: The line budget names its exceptions exactly

The source line budget SHALL exempt a file under `src/` only when its path
relative to `src/` is on the allow list, and SHALL fail for a listed path that
no longer exists or is back within the budget.

#### Scenario: Same name elsewhere
- **WHEN** a new `src/core/foo/types.ts` has 300 lines and only `harness/types.ts` is listed
- **THEN** the test fails naming `src/core/foo/types.ts` and its line count

#### Scenario: Stale entry
- **WHEN** a listed file is split and now has 200 lines
- **THEN** the test fails saying that path is within the budget and should leave the allow list

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: modifies "Source module line budget enforcement".

One task.

## Background

**Measured on 2026-10-02.** Eleven files under `src/` are over the budget,
and every one matches an allow-list basename today:

| Path under `src/` | Lines (`wc -l`) |
|---|---|
| `core/report/report.ts` | 2053 |
| `core/spec/linter.ts` | 1392 |
| `core/status/show.ts` | 1172 |
| `core/spec/delta.ts` | 864 |
| `harness/opencode/opencode.ts` | 685 |
| `harness/types.ts` | 677 |
| `watcher/loop.ts` | 622 |
| `harness/agy/agy.ts` | 385 |
| `core/spec/migrate.ts` | 382 |
| `cli/report.ts` | 352 |
| `core/spec/parser.ts` | 324 |

`cli/show.ts` (57) and `cli/migrate.ts` (84) share listed names but are
within the budget, so they need no entry.

**`cli/report.ts` is listed, not split.** It is the one file that passes only
by name. Splitting it is a refactor with its own risk, and this change only
tightens the gate. Listed by full path, it is an explicit exception, and the
shrink rule removes it once a later change brings it under 250 lines.

**How lines are counted.** The test counts `source.split('\n').length`, one
more than `wc -l` for a file ending in a newline. The change keeps that
measure, so a file is within the budget at 250 or fewer counted lines.

**Why a helper module.** The check passes today and must pass afterwards on
the real tree, so a verify that runs only `tests/line-budget.test.ts` would
start green and prove nothing new. The check moves into
`tests/line-budget-check.ts`, which `tests/**/*.test.ts` does not run on its
own; `tests/line-budget.test.ts` calls it on `src/`, and the new
`tests/line-budget-check.test.ts` calls it on temporary trees. The new test
file is missing before the task, so its verify starts red. `AGENTS.md` keeps
naming `tests/line-budget.test.ts`, which still holds the allow list.
