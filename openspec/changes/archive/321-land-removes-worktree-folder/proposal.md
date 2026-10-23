---
title: osq land removes a landed change's whole worktree folder, or fails saying why
depends_on: []
verify: pnpm verify
features:
  reads: [cli-foundation, spec-lint-and-approve, status-inspection, watcher-and-harness]
---
## Goal

On 2026-10-23 eight landed changes had left about 35 GB under
`~/.osq/worktrees`. Land removes a worktree with `git worktree remove`,
bounded by `timeouts.gitSeconds` (10 s by default). When 310 landed, that
limit cut the remove off while it was deleting a 12 GB Rust `target/`
folder. Git had already deleted the worktree's `.git` file, so the folder
stayed behind, no longer listed as a worktree. Land printed `Kept worktree
<path>:` with an empty reason and exited 0. Four such folders, from 309,
312, 314 and 315, are still on disk.

This change makes land do the delete itself. Once the land commit is in,
`landChange` copies the change folder's `.run/logs` (ignored by git, so they
live only in the worktree) into the checkout's archived change folder. It
then deletes the whole worktree folder, ignored build output included,
with no time limit, and runs `git worktree prune`. A failed step prints
`Could not remove worktree <path>: <cause>` and land exits 1, keeping the
land commit. A folder left at the worktree path is removed by the next
`osq land <id>`, even when git no longer lists it. Separately, a git command
that `GitVcs` ends at its time limit now says so: `git <args> timed out
after <n>s`.

## Verify

`pnpm verify` runs both typechecks, the build, every test and lint. It
proves, on scratch repositories, that land deletes a worktree holding
ignored files and copies its logs into the checkout. It proves that a
folder land cannot delete gives exit 1 with the path and `EACCES`, after
the land commit, and that the next land removes a leftover folder git no
longer lists. It proves that a prune past `timeouts.gitSeconds` fails
naming its time limit, and that every earlier land test still holds.

## Non-goals

- Removing worktrees of changes that have not landed (reject and approve keep `worktreeRemove`).
- The Rust land feature; `rust-land-remove-worktree` ports this.
- Cleaning up leftover folders of changes nobody lands again; `osq land <id>` cleans each one on request.

## Surface

- Added: land output line `Could not remove worktree <path>: <cause>`, with exit 1.
- Removed: land output line `Kept worktree <path>:`.
- Added: git error text `git <args> timed out after <n>s`.

## Decisions

- ADR 021: autopilot already stops with `land_stopped` when land exits non-zero, as after a failed after-land command; a failed cleanup now does the same, after the change has landed.

## Assumptions

- A folder at a change's worktree path under `vcs.worktreeRoot` belongs to osq, so land may delete it even when git no longer lists it as a worktree.
- Deleting the worktree loses nothing: land refuses a worktree with any `git status` entry before it commits, so only ignored files remain, and `.run/logs` is copied first.
- A failed cleanup should exit 1 even though the change has landed, as the brief asks; with autopilot on, that stops autopilot until a human runs `osq land <id>` again.
- A rough version of this change passed all four new land scenarios and the timeout scenario, and broke no existing test once the cleanup found the checkout folder through `listChanges` (measured 2026-10-24).

## Contract

### Requirement: Land cleanup

See `specs/version-control/spec.md`, MODIFIED "Land cleanup", with four
new scenarios: "Ignored build output removed", "Logs kept in the checkout",
"Removal fails after the land commit" and "Leftover folder removed on the
next land".

### Requirement: Git timeout message

See `specs/version-control/spec.md`, ADDED "Git timeout message", with the
scenario "Prune past its time limit".

## Human steps

### Before approval

None

### After landing

- Leftover folders from earlier lands (309, 312, 314 and 315 today) go away with `osq land <id>` for each; nothing waits on it.

## Delta

- `specs/version-control/spec.md`: MODIFIED "Land cleanup", its three scenarios unchanged plus four new ones; ADDED "Git timeout message".
- No file is shared by two tasks.
