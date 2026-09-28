---
title: A landed change counts once, even while its worktree is kept
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - version-control
---
## Goal

After a change lands by hand, osq counts its archive once. Today the kept
worktree still holds the archive, so `listChanges` returns two archived
changes with the same folder, and `osq queue` and `osq plan --next` fail with
`Ambiguous queue association`. Status, the inbox, the report, and the web data
count the change twice.

The checkout's copy is the landed one, so it wins. `osq message` keeps
reading the worktree's copy, because the landing command runs it right after
`git merge --squash` has already put the archive in the checkout.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The fix is tested in a real
temporary git repository: a change approved into a worktree runs to its
archive commit, is squashed onto the default branch by hand with
`git merge --squash` and `osq message <id> | git commit -F -`, and its worktree
is kept. The queue, status, bare `osq`, the inbox, and the report are then
read through their commands.

## Non-goals

- Removing or pruning worktrees. That's `osq-land`.
- Deciding "landed" through git. A file in the checkout's archive is enough:
  it runs no git command, and it also covers the staged squash before the
  commit.
- Changing which copy an active change comes from. The worktree's copy of an
  active change still wins, since that is where it runs.
- `osq message` for a change that has already landed and whose worktree was
  removed. It refuses as it does today.

## Surface

- Changed: `listChanges` lists an archived or rejected folder once, from the checkout, when a kept worktree or stacked tree holds the same folder (behaviour)

## Decisions

- ADR 002: unchanged; archive is untouched, and `osq message` reads the archive as the archiver wrote it.

## Background

`listChanges` in `src/core/status/change-locations.ts` lets each worktree or
stacked tree contribute the folder it names, in any location, and the project
root contribute every folder except an active one a named tree holds. After a
hand landing the checkout's archive and the kept worktree's archive both hold
the folder, so both are listed. None of its about 15 readers removes
duplicates; `readQueueState` throws on them.

`buildSquashMessage` in `src/core/run/squash-message.ts` finds its folder by
filtering `listChanges` to worktree trees. If `listChanges` alone dropped the
duplicate, the landing command
`git merge --squash osq/<folder> && osq message <id> | git commit -F -` would
refuse halfway, because the merge has already put the archive in the
checkout. The existing test "Landing by hand keeps the trailers" in
`tests/squash-message.test.ts` catches exactly that. So `buildSquashMessage`
reads the worktree tree from `changeTrees` directly, and the two changes ship
in one task.

`findLandCandidates` in `src/core/status/dispatch-land.ts` lists archived
worktree changes and keeps those the default branch does not hold yet. After
the fix, a landed change's worktree copy is no longer listed, which removes
the same change from its candidates one step earlier, with the same result.

## Contract

### Requirement: Nothing else changes
Without a kept worktree whose change has landed, every reader SHALL list
exactly what it listed before.

#### Scenario: Existing suites
- **WHEN** the existing suite runs
- **THEN** every test passes unchanged

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/status-inspection/spec.md`: modifies "Change locations" and "Change location readers".
- `specs/watcher-and-harness/spec.md`: modifies "Squash commit message".

One task, because the resolver fix without the `osq message` fix breaks hand
landing.
