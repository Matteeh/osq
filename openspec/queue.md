# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

Stage 1 of `decisions/003-git-strategy.md` is complete: changes 087 to 096 landed with `vcs.enabled` off. `enable-vcs-for-osq` turns it on for this repository once the human decides to approve and land on `main`.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [enable-vcs-for-osq] Turn on version control for osq itself

Depends on: nothing

### Goal

osq's own changes run in worktrees on `osq/` branches from here on. This is the first change after stage 1, and the first real test of it.

### Context

- ADR 003 migration: every stage-1 change ran with the flag off; the flag turns on for the change after the stage.
- Approve refuses off the default branch without `--base-ok`, so approvals from here on happen on `main`.

### Requirements

- `osq.config.ts` sets `vcs.enabled: true`, `vcs.author`, and `vcs.prepare: 'pnpm install --frozen-lockfile'`.
- README.md documents the stage-1 flow: approve on the default branch, where the worktree is, not editing it while a task runs, and landing by hand with `osq message`.

### Non-goals

- Any code change.

### Notes for planning

- Ask the human which identity `vcs.author` should use.
- `osq doctor` should show no `vcs-prepare` warning afterwards.
