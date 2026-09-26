---
title: A worktree names a change only when it holds it
depends_on: ["094"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - version-control
    - watcher-and-harness
    - web-inspection
---
## Goal

A worktree on `osq/<folder>` that does not hold that change no longer hides
the change's stacked approval or the checkout's copy. It holds the change
when the folder is approved in the worktree's changes directory, or present
in its archive or rejected directory. So a failed stacked cut can keep the
worktree it added, and after `osq retry <id> change` the next cycle reuses
that worktree, as change 094's "Stacked cut" first intended.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests on temporary git
repositories show three things. `changeTrees` drops a worktree that does not
hold its change and keeps one that does. A failed cut through
`runWatcherOnce` leaves the branch, the worktree, and the stacked approval
in place. The next cycle, after `retrySpec`, reuses that worktree path and
makes one `osq: <id> approved` commit.

## Non-goals

- Any other change to stacking.
- Removing a worktree that no longer holds its change. It stays until a cut
  reuses it or a human removes it.

## Surface

- Changed: a worktree on `osq/<folder>` counts as that change's tree only when it holds `<changes>/<folder>/.run/approved`, `<archive>/<folder>`, or `<rejected>/<folder>` (change resolution)
- Changed: a failed stacked cut keeps the worktree it added (watcher behaviour)

## Decisions

- ADR 002: unchanged; the cut still takes the dependency's archive commit as it is, and nothing re-applies a delta.

## Background

ADR 003 decisions 2 and 11. `changeTrees` in
`src/core/status/change-locations.ts` names a folder by the worktree's branch
alone. It then drops the stacked tree and the checkout's copy for that
folder. Change 094's task 4 worked around this. A failed cut removes the
worktree it added and prunes git's record before rethrowing, and keeps the
branch and the stacked approval. `removeFailedWorktree` in
`src/core/spec/stack-cut.ts` does this, as that task's `## Deviated`
reported.

The brief asks that a worktree name its folder when it holds the folder in
its changes, archive, or rejected directory. This plan counts a folder in
the changes directory only when it has `.run/approved`. The reason is a draft
that a human committed on `main` before the dependency's branch was cut. A
worktree cut from that branch holds an unapproved copy of the draft, and
that copy would hide the stacked approval again. Approval commits
`.run/approved` as the branch's first commit, and nothing removes it, so a
running change always has it.

A trial of both parts in a scratch worktree broke exactly two tests, apart
from the bin, package, and export tests that fail there without a build.
`tests/change-locations-stacked.test.ts` ("prefers a worktree over a stacked
directory for the same folder") and `tests/serve-sse-worktrees.test.ts`
("passes the resolved worktree trees to the invalidation hub") each add a
worktree that holds only a committed draft. Task 1 gives each worktree copy
a `.run/approved`. `tests/stack-run.test.ts` ("halts on a failed prepare and
resumes after retry") passes unchanged. It asserts neither the removal nor
the reuse, so task 2 proves the reuse in a new test.

`stack-dependencies.ts` holds a copy of `findChange`'s unexported
`matchesFolder`. Task 1 exports `matchesFolder` from `change-locations.ts` and
removes the copy.

## Contract

### Requirement: Existing resolution unchanged
A worktree that holds its approved change SHALL resolve exactly as before
this change.

#### Scenario: Existing suite
- **WHEN** the existing change location, stacking, status, and serve tests run
- **THEN** every one passes, except the two Background names, which task 1 updates

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/status-inspection/spec.md`: modifies "Change locations".
- `specs/watcher-and-harness/spec.md`: modifies "Stacked cut".

Two tasks, and no two share a file. Task 1 changes the resolver and the
two pinned tests. Task 2 keeps the failed cut's worktree. Task 1 comes first
because, until the resolver changes, a kept worktree would hide the stacked
approval.
