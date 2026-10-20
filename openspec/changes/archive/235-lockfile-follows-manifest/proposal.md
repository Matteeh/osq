---
title: A task whose scope covers a Cargo.toml or package.json may also change the workspace lockfile
depends_on: []
verify: pnpm verify
features:
  reads: [version-control, cli-foundation, status-inspection]
---
## Goal

Executors stop dying on a lock file they had to change. Adding a dependency to
a manifest changes the workspace lock file too: 229 task 1 died with
`scope_violation` because adding `<dep>.workspace = true` to a crate's
`Cargo.toml` changed the root `Cargo.lock`, which its scope lacked. With
parallel changes more tasks add dependencies at once, so the miss would repeat.

After this change, a lock file counts as inside a task's scope when the same
task changed a manifest its scope covers, in the lock file's folder or below
it. The languages kernel decides which lock files follow which manifests from
its presets (ADR 017). The scope violation check and the verified task commit
use the same rule, so the lock file is allowed and committed with the task.

The lock file never joins the task's resolved scope. The done marker's scope
hash and the scope audit ignore it, so when a later task changes the lock file
again, no earlier task becomes stale and nothing needs recertifying.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint, including the new
languages test and the worktree tests for the scope check and commit.

## Non-goals

- Lock files of package managers osq does not detect today.
- Merging lock file conflicts at land.
- A lock file that changes while no scoped manifest changed; that stays a scope violation.
- Any new lint or planner rule.

## Surface

None

## Decisions

- ADR 002: archive is untouched; deltas still merge without a model.
- ADR 010: the validator is untouched.
- ADR 012: the watch service is untouched.
- ADR 018: steering is untouched.
- ADR 019: tapped planners are untouched.
- ADR 021: autopilot is untouched.

## Assumptions

- A lock file only needs to follow a manifest the same task changed. A task that changes `Cargo.lock` without touching any manifest it scopes still dies with `scope_violation`, as today.
- Leaving the lock file out of the done-task hash is what "the scope audit treats it the same way" should mean: the audit never flags it, rather than pinning it to every task that scopes a manifest, which would make three Rust tasks in one change halt as `ambiguous` whenever two of them add a dependency.
- A trial of this change on a scratch worktree passed the whole TypeScript suite, except the 8 tests that need a build (`dist/` and the staged dashboard), which the trial tree lacked.

## Contract

### Requirement: Lock file of a manifest

See `specs/languages/spec.md`.

### Requirement: Lock file follows a manifest

See `specs/watcher-and-harness/spec.md`.

### Requirement: Lock file outside the scope audit

See `specs/watcher-and-harness/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/languages/spec.md`: ADDED "Lock file of a manifest".
- `specs/watcher-and-harness/spec.md`: ADDED "Lock file follows a manifest" and "Lock file outside the scope audit".

No file is shared between tasks.
