---
title: osq land builds the land commit from the verified tree and cannot end half-done
depends_on: ["108"]
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - status-inspection
    - web-inspection
---
## Goal

`osq land <id>` either lands a change completely or changes nothing. osq builds
the land commit from the tree of the change's branch tip, with the default
branch as its only parent, and moves the checkout to it only by a
fast-forward. The squash can't conflict in the checkout, a failed commit can't
leave a squash staged, and unrelated uncommitted work in the checkout no
longer blocks a land.

Archive runs the change-level `verify` after it merges the deltas into the
living specs, so the archived tree is a verified tree. `osq land` then runs
`verify` only when its sync merged new commits. When it does, it says so
before the wait and records the sync and the `verify` as events on the branch.

The hand-landing path goes, as ADR 006 retires it.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The new port operations are
tested on temporary repositories through `GitVcs`, the archive order through
`checkAndArchiveSpec` and a watcher cycle, and landing through `landCommand` on
temporary projects that approve and run changes into real worktrees.

## Non-goals

- Landing without an id, or several changes at once.
- Landing automatically after archive.
- Pushing.
- Removing the leftover-draft handling. `approve-owns-draft` stops creating
  leftovers.
- Recording a sync that stops. A stop leaves the worktree's HEAD and status as
  they were, so it writes no event; its message carries the `verify` output.
- Removing `merge`'s squash mode from the `Vcs` port. Land no longer uses it,
  but it is tested and harmless.
- Rewriting the status-inspection and watcher-and-harness scenarios that
  describe a checkout after a hand landing. Changes already landed that way,
  such as 101 and 102, still exist.

## Surface

- Changed: `osq land <id>` no longer refuses unrelated uncommitted changes in the checkout
- Added: `The checkout has uncommitted changes in files this land writes: <paths>; commit or stash them, then run osq land <id> again` (land stop)
- Added: `<default branch> has <n> new commits; merging into osq/<folder> and running verify: <command>` (`osq land` line on stderr)
- Removed: `The squash is staged. Finish with: osq message <id> | git commit -F -` and `Or undo it with: git reset --merge` (land output)
- Removed: `Land: osq land <id>` on `osq message`'s stderr
- Added: `synced` (event type, in `.run/events/change.jsonl`)
- Changed: `osq land` appends `verify_ran` to `.run/events/change.jsonl` when its sync runs `verify`
- Added: `.run/archive-specs.json` (transient archive record)
- Changed: README's "Working with version control on" loses the hand-landing step

## Decisions

- ADR 001: `osq land` and `osq message` still load `osq.config.ts` through `loadConfig`.
- ADR 002: archive still merges deltas with `applyOpenSpecDeltas`, without a model. Only the change-level `verify` moves after the merge, and a red one puts the living specs back byte for byte.
- ADR 004: unchanged; nothing here runs the OpenSpec validator.
- ADR 005: unchanged; nothing here checks the validator range.
- Departs from ADR 003: decision 8 says osq runs the repository's commit hooks, and the land commit is built with `git commit-tree`, which runs none. ADR 006 retires hand landing and names this revision; task 4 rewrites decisions 7 and 8 to match, so ADR 003 describes the new land when this change lands.

## Background

**Answers to the brief's two questions.** Measured on 2026-09-28 with git
2.34.1: `git commit-tree` ignores `commit.gpgSign`. With the setting on and
`gpg.program` pointing at a script that records its call, the script never ran
until `-S` was passed. So `commitTree` passes `-S` when
`git config --type=bool --get commit.gpgSign` prints `true`, and osq never
disables signing. A red change `verify` after the delta merge reuses
`.run/regressed/change.md` with reason `verify_red`. The inbox, `osq show`, and
`osq retry <id>` already handle that marker, and the living specs are put back
before the next attempt, so no new reason is needed.

**Why fast-forward works.** A prototype in a scratch repository, then a second
one while planning: `git commit-tree <branch tip>^{tree} -p main`, then
`git merge --ff-only <commit>` in the checkout. It landed with an unrelated
modified file, a staged file, and an untracked draft left exactly as they were.
With a modified file the commit also changes, git refused and `main` did not
move. `fastForward` checks that overlap itself before running git, so osq can
name the files without reading git's localised output.

**Putting the specs back.** Archive now writes the living specs before the
change `verify` runs, and that `verify` can take minutes. If it goes red, or the
watcher stops during it, the specs must go back to exactly what they were:
applying a REMOVED or RENAMED delta twice fails, and in a worktree a modified
spec halts the change with `worktree_dirty`. So archive first writes what it is
about to overwrite to `.run/archive-specs.json`, and puts it back on a red
`verify` or at the start of the next archive attempt. The watcher's archive step
does that before it checks the worktree.

**Where the land events go.** The sync appends `verify_ran` and `synced` to the
archived folder's `.run/events/change.jsonl` in the worktree and stages it
before the sync commit. The land commit is built from the branch tip's tree, so
the events reach the default branch with the change. A stop aborts the merge,
which drops them with the rest.

**Measured fallout.** A rough version of all four tasks ran the full suite in
a scratch worktree. Only these failed: `tests/vcs-write.test.ts` (the port's
member list), `tests/line-budget.test.ts` (`git-vcs.ts` at 254 lines),
`tests/vcs-land.test.ts` (the hook test and a refusal test built on a dirty
checkout), `tests/vcs-land-refusals.test.ts` (the modified-file refusal), and
`tests/squash-message.test.ts` (the `Land:` line). README and ADR changes add
`tests/readme-land.test.ts`. Moving the archive's change `verify` broke no
test. The progress line goes to stderr, so the conflict test's empty stdout
still holds.

## Contract

### Requirement: A land ends complete or changes nothing
`osq land <id>` SHALL either move the default branch to one new commit whose
tree is the verified branch tip's tree, or leave the default branch, the
checkout's index, and its tree as they were.

#### Scenario: Stopped land
- **WHEN** any refusal or stop of `osq land` happens
- **THEN** the default branch, the checkout's index, and its tree are what they were, and nothing is staged by osq

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: adds "Vcs land operations" and "Land from the verified tree"; modifies "Default branch sync" and "Land refusals"; removes "Land".
- `specs/cli-foundation/spec.md`: adds "Land message command"; modifies "Land command" and "osq runs its own changes under version control"; removes "Message command".
- `specs/watcher-and-harness/spec.md`: modifies "Archive-time verification re-run".

Four tasks. Task 1 moves the archive's change `verify` after the delta merge.
Task 2 adds the port operations. Task 3 rebuilds landing on them and records
the sync. Task 4 removes the hand-landing path from `osq message`, README, and
ADR 003.

No file is shared between tasks.
