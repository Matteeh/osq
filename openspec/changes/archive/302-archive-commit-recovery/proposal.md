---
title: A failed archive commit in a worktree is retried and shown, not swallowed
depends_on: []
verify: pnpm verify
features:
  reads: [cli-foundation, spec-lint-and-approve, web-inspection]
---
## Goal

When the archive commit in an osq worktree fails, the watcher logs a
warning and moves on. The change sits archived on disk with the move
uncommitted, nothing records why, the inbox says `osq land <id>`, and
land refuses with a bare list of uncommitted paths, so a human ends up
running git by hand, against ADR 003. This happened to 289 on 2026-10-22.

This change treats a failed archive commit like a failed task commit
already is. The watcher halts the archived change with reason
`commit_failed` and git's output. Each later cycle it retries the archive
commit within `gates.commitRetries`. `osq retry <id> change` makes the
commit when the budget is spent. `osq show`, the inbox and the dispatcher
offer that retry instead of `osq land`, and land refuses with a message
that says what failed and what to run.

## Verify

`pnpm verify` runs the CLI and UI typechecks, the build, every test and
lint. It proves, on scratch repositories with a failing `pre-commit` hook,
that the failure is recorded, caught up, retried by a human and refused by
land, that show and the inbox name the retry, and that every earlier
watcher, status and land test still holds.

## Non-goals

- The Rust archive; `rust-archive-worktree` already fails loudly.
- Finding why git failed for 289.
- A new halt reason; `commit_failed` already means a commit osq could not make.

## Surface

- Changed: `osq retry <id> change` (command): on an archived change whose archive commit failed, it makes that commit
- Changed: `osq land <id>` (command): refuses a change whose archive commit failed and names the retry

## Decisions

- ADR 002: the archive itself is unchanged; only its commit is recorded and retried.
- ADR 003: osq alone makes the missing commit, through the watcher or `osq retry`; no human runs git.
- ADR 006: the failure is a recorded halt with one next command, and the catch-up is deterministic.
- ADR 010: no validator change.
- ADR 012: no watch service change.
- ADR 018: an archive commit failure is not a steering trigger, so no planner runs for it.
- ADR 019: no tapped planner change.
- ADR 021: autopilot sees the change as dead, as it sees any `commit_failed` halt.

## Assumptions

- The archived folder's `.run/regressed/change.md` is the right record: land stops already write their halts there, and `osq retry <id> change` already clears them on an archived change.
- The catch-up counts its budget exactly as "Commit failure catch-up" does for task commits.

## Contract

### Requirement: Archive commit failure

See `specs/watcher-and-harness/spec.md`, with "Archive commit failure",
"Archive commit catch-up" and "Retrying a failed archive commit";
`specs/status-inspection/spec.md`, with "Archived change with a failed
archive commit", "Next step detail and format" and "Change next step";
and `specs/version-control/spec.md`, with "Land refuses a failed archive
commit".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: ADDED "Archive commit failure", "Archive commit catch-up" and "Retrying a failed archive commit".
- `specs/status-inspection/spec.md`: ADDED "Archived change with a failed archive commit"; MODIFIED "Next step detail and format" and "Change next step".
- `specs/version-control/spec.md`: ADDED "Land refuses a failed archive commit".
- No file is shared by two tasks.
