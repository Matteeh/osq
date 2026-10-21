---
title: osq lint of a steered change from the main checkout finds the change's own files in its worktree
depends_on: []
verify: pnpm verify
features:
  reads: ["version-control", "status-inspection", "cli-foundation", "watcher-and-harness"]
---
## Goal

Steering a running change means editing it in its worktree and linting it
from the main checkout. That lint reports every `entry` line naming one of
the change's own files, such as its delta spec, as missing. The cause is
`liesInsideChangeFolder` in `src/core/spec/entry-lint.ts`: it resolves the
entry against the main checkout, while the change folder exists only in the
worktree. On 2026-10-21 steering 251 failed this way, and the workaround
was to delete those entry lines from done tasks.

This change makes an entry inside the change folder count as provided when
the file exists in the folder being linted, wherever that folder is.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. That
includes the new test, which builds a git repository with a worktree on
`osq/001-steer` and lints a change that exists only there from the main
checkout, through `lintChangeFolder` and through `osq lint`. The existing
entry tests keep proving the other ways an entry is provided.

## Non-goals

- Changing where steered changes are linted from, or how `osq lint` finds a change.
- The opposite problem, that linting in the worktree reports the tests done tasks created as preexisting.
- The runner's entry check before a task starts, which already reads the worktree.

## Surface

None

## Decisions

- ADR 004: the OpenSpec validator runs as before; only the entry check changes.
- ADR 005: the validator's peer range is untouched.

## Assumptions

- An entry inside the change folder used to count as provided even when the file did not exist. It now has to exist in the folder, as the brief asks, so a typo in such an entry becomes a lint error instead of an `entry_missing` stop when the task starts. Every entry inside a change folder in today's active changes names a file that exists.
- An entry names a path inside the folder when it starts with `<openspecRoot>/changes/<folder>/`. That is the same in the checkout, a worktree and a stacked copy, since each is a full tree of the repository.
- The test proves its scenarios with `node:test` titles, as `tests/entry-lint.test.ts` does, because the living spec-lint-and-approve spec holds duplicate scenario names (`Python-only repository`, `Version control off`) that the `scenario` helper refuses.

## Contract

### Requirement: Entry paths exist

See `specs/spec-lint-and-approve/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: MODIFIED "Entry paths exist". It changes the first way an entry is provided, keeps both scenarios word for word, and adds "Entries inside the change folder" and "Steered change linted from main".
