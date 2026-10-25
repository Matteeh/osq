---
title: Removing a big worktree is never cut off halfway
depends_on: []
verify: pnpm verify
features:
  reads: [watcher-and-harness, status-inspection, metrics-and-reporting]
---
## Goal

`GitVcs.worktreeRemove` runs `git worktree remove` through the same runner
as quick git reads, bounded by `timeouts.gitSeconds`, 10 seconds by default.
On 2026-10-24 `osq approve 326` merged main into `osq/326`, the merge
conflicted, and `restartDefaultBranchBranch` removed a worktree holding a
20 GB `target/`. Git was killed partway: `.git`, `crates/`, `decisions/` and
`scripts/` were gone, `target/`, `node_modules/` and `src/` stayed, and git
listed the worktree as prunable. The next `osq approve 326` failed with
`git is off: not a git repository`, and recovery took a manual move-aside,
`git worktree prune` and a watcher restart.

This change gives `git worktree remove` its own bound,
`timeouts.gitWorktreeRemoveSeconds`, 1800 seconds by default. When the
removal still fails or times out during a restart, approve stops before any
other restart step with a message that names the worktree and the recovery
steps, and leaves the branch and the markers as they were. A second
`osq approve` then finishes the restart. Today that second approve fails
with git's `nothing to commit`, because the `osq: <id> replanned` commit
finds nothing new, so approve now skips that commit when the change folder
has no changes.

## Verify

`pnpm verify` runs both typechecks, the build, every test and lint. It
proves that `git worktree remove` takes its bound from the new key and not
from `timeouts.gitSeconds`, and that an approval whose restart cannot remove
the worktree stops with the recovery message, leaves `.run/regressed/change.md`
and `osq/<folder>` unchanged, and that a second approval restarts the change.

## Non-goals

- Making `git worktree remove` faster, for example by deleting `target/` first.
- The Rust vcs kernel and the Rust config's `osq.toml` keys; Rust land wires its own timeouts.
- Recovering a broken worktree inside `osq approve`; the watcher's `recreateWorktrees` does that on restart.
- Land's worktree cleanup, which deletes the folder with `fs.rm` and runs `git worktree prune`, so it never runs `git worktree remove`.

## Surface

- Added: `timeouts.gitWorktreeRemoveSeconds` (config key), default 1800.
- Added: the `osq approve` error `could not remove worktree <path>: <git's message>` with its recovery line.
- Changed: `osq approve` of a default-branch stop with no plan edit no longer fails with `nothing to commit`; it skips the `osq: <id> replanned` commit.

## Decisions

- ADR 001: the new key loads through the existing jiti config path.
- ADR 004: the OpenSpec validator run is unchanged.
- ADR 005: the validator peer range is unchanged.
- ADR 010: the validator role is unchanged.
- ADR 012: the watcher's restart and `recreateWorktrees` are unchanged; the recovery message points at them.
- ADR 015: MCP tools are unchanged.
- ADR 018: a failed restart leaves the steering triggers in place, so auto-steer sees the same change.
- ADR 019: tapped planners are unchanged.
- ADR 021: autopilot recovery sees the approve error as any failed approval.

## Assumptions

- 1800 seconds is enough to delete a 20 GB build folder on the slowest disk osq runs on, WSL included.
- Skipping an empty `osq: <id> replanned` commit is safe: the branch tip already holds that folder, which is what the commit exists to keep.
- A rough version of this change, measured on 2026-10-25, broke no existing test. `src/core/vcs/git-vcs.ts` and `src/core/foundation/config.ts` both sit at the line budget, so task 1 moves `runGit` and `OsqTimeouts` into their own files to make room.

## Contract

### Requirement: Worktree removal time limit

See `specs/version-control/spec.md`.

### Requirement: Version control configuration

See `specs/cli-foundation/spec.md`: the new key and its default.

### Requirement: Approval after a default-branch trigger

See `specs/spec-lint-and-approve/spec.md`: the skipped empty commit, the
stop when the worktree cannot be removed, and the scenario "Worktree
removal fails during a restart".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: ADDED "Worktree removal time limit".
- `specs/cli-foundation/spec.md`: MODIFIED "Version control configuration"; its scenarios are unchanged.
- `specs/spec-lint-and-approve/spec.md`: MODIFIED "Approval after a default-branch trigger" with one new scenario; its six scenarios are unchanged.
- No file is shared by two tasks.
