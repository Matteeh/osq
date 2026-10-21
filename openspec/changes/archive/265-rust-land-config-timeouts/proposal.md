---
title: Rust land bounds its git commands by the timeouts in osq.toml
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-config, rust-vcs]
---
## Goal

Rust land builds every `GitVcs` with `GitVcs::new`, which keeps TypeScript's
default limits, so a project's `[timeouts]` in `osq.toml` never reach the git
commands land runs. This change passes the loaded config's `timeouts` to
every `GitVcs` land builds, with `with_timeouts` from 257.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the corpus link gates included, so it proves land's new
test passes and the land crate's other tests still do.

## Non-goals

- Timeouts for any other feature.
- A new land message for a timed-out git command; the `VcsError` display stays.
- A way to swap land's git program.

## Surface

- Changed: `timeouts.gitSeconds` and `timeouts.gitCommitSeconds` (config keys) now bound the git commands Rust `land` runs.

## Decisions

- ADR 022: land stays one feature crate; it reads the limits through the config kernel and calls no other feature.
- ADR 023: one small named helper builds every `GitVcs`, with a one-line doc.
- ADR 024: the helper's doc ends `Implements: rust-land/land-git-limits`, and each test names `Covers: rust-land/<scenario>`.
- ADR 025: the limits come from the hand-written `osq.toml`, under TypeScript's key names.
- ADR 026: land reads no spec, so OpenSpec parsing does not change.
- ADR 027: land still lands one change at a time; the limits change no scheduling.
- ADR 028: `LandFeature` stays a unit struct; the timeouts come from the root's config on every run.
- ADR 029: the limits come from the typed `Timeouts` that `load_config` gives, with TypeScript's defaults for missing keys.

## Assumptions

- The brief asked for the committed fake git from 260. Land has no way to take another git program, so the test uses real git instead, slowed by a per-worktree `core.fsmonitor` of `sleep 30`. Git 2.34 on this machine runs that through the shell, and only for commands that refresh that worktree's index. A git that ignored `core.fsmonitor` would make the test run into the default 10 second limit and fail on its message.
- "The land error TypeScript gives for a failed git command" is read as the existing rule in "Land settings": land fails with the `VcsError` display, which for a timeout names the command and the limit.

## Contract

### Requirement: Land git limits

See `specs/rust-land/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-land/spec.md`: ADDED "Land git limits", with the scenario "A slow git status stops land at the configured limit".
