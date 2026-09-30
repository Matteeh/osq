---
title: A task may delete a file its scope names
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - status-inspection
    - version-control
---
## Goal

A task can delete a file its `scope` names. Today the watcher's git guard
resolves the scope from disk after the task, so a file the task deleted is not
in scope any more and counts as a `scope_violation`. That killed 123 task 2
attempt 1 and task 4 attempt 2, and it is why 123 left five inert
`export {};` modules. Past the guard, the task's commit would also drop the
deletion, because it keeps only paths that exist.

After this change the guard judges each changed path against the scope
patterns without reading the disk, and the task's commit records a scoped
deletion. A deleted or edited file outside the scope is still a violation.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. A new test runs tasks in an
osq worktree through `runWatcherCycle`. One deletes scoped files, a source file
and a test with `tests.modify: true`, and is done with the deletions committed
and a clean worktree. One deletes a file outside its scope and records a
`scope_violation`.

## Non-goals

- Deleting the inert modules 123 left. That is `inert-module-cleanup`, which
  needs this change landed and osq rebuilt first, because the watcher runs
  the build on `main`.
- Changing how the recertification audit hashes a deleted file. It already
  hashes a missing scoped file as null.
- The pre-spawn test gate. `captureTestGate` builds its authorized set before
  the task runs, while the files exist, so a scoped test's deletion already
  passes it.

## Surface

None

## Decisions

- ADR 002: unchanged; archive and delta application do not move.

## Background

**The two places.** `scopeViolations` in `src/watcher/git-guard.ts` builds its
in-scope set from `resolveScope` after the agent exits. `resolveScope` gives a
missing exact entry a null `absolutePath`, which the guard drops, and a glob
lists only files that exist. `verifiedCommitPaths` in
`src/core/run/task-commit.ts` sends every path through `existingPaths`.
`scopeCoversPath` in `src/core/run/scope.ts` already matches a path against
scope patterns without the disk, and `scopedStatusPaths` uses it. Every path
status lists is tracked or is an untracked file that exists, so
`git add -- <path>` stages each one, a deletion included.

**Measured fallout.** A rough version of the fix was run on 2026-10-01 in a
scratch worktree through the CLI typecheck, lint, and the full suite: 2855
passed and none failed. No existing test changes.

## Contract

### Requirement: A scoped deletion is allowed
A task SHALL be able to delete a file its scope names, and its commit SHALL
record the deletion. A file outside the scope SHALL still be a violation,
deleted or edited.

#### Scenario: Deleted scoped file
- **WHEN** a task deletes `src/old.ts`, which its scope names, and passes
- **THEN** it is done, and its commit records the deletion

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: modifies "Scope violation recording" and "Verified task commit".

One task. No file is shared.
