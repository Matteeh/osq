---
title: The vcs kernel bounds every git command by the timeouts in osq.toml
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: ["rust-config"]
---
## Goal

The vcs kernel runs git with no time limit, because no config reader
existed when its reads and writes landed (241, 245). A hung git process
therefore hangs its caller. This change bounds each git command by the
limit TypeScript's `GitVcs` uses for it, taken from the config kernel's
`Timeouts`. A command that runs out of time is killed and gives a typed
error naming the command and the limit.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
The new vcs tests run a fake git program that sleeps on one named command,
with limits of a few hundred milliseconds. The existing vcs tests keep
proving that reads and writes behave as before under the default limits.

## Non-goals

- Reading `osq.toml` inside the vcs kernel; the caller passes the timeouts.
- `timeouts.git_remote`: the Rust vcs kernel has no fetch or push yet.
- Passing configured timeouts from any caller, such as the land feature (256), which keeps `GitVcs::new` and so TypeScript's default limits until a later item wires `with_timeouts`.

## Surface

None

## Decisions

- ADR 022: `osq-kernel-vcs` gains a dependency on the kernel crate `osq-kernel-config`, for its `Timeouts` type only. Kernels may depend on kernels, and the config kernel depends on no other workspace crate, so no cycle is possible.
- ADR 023: choosing a command's limit is a pure private function of its arguments; the one runner in `git.rs` alone spawns, waits and kills.
- ADR 024: every public item this change adds or changes ends its doc with `Implements: rust-vcs/git-command`, and every new test names `Covers: rust-vcs/<scenario>`.
- ADR 025: the limits are today's `timeouts.gitSeconds` and `timeouts.gitCommitSeconds`, with TypeScript's defaults of 10 and 120 seconds.
- ADR 026: nothing here parses OpenSpec.
- ADR 027: nothing here schedules.
- ADR 028: no feature changes; `GitVcs::new` keeps its signature, so features that build one still compile.
- ADR 029: the vcs kernel takes the typed `Timeouts` from the config kernel and never reads `osq.toml` itself.

## Assumptions

- The brief says `GitVcs` takes `&Timeouts`. That is `with_timeouts(&Timeouts)` rather than a new argument to `GitVcs::new`, which keeps TypeScript's defaults. Change 256 is running on `GitVcs::new(root)`, so changing that signature would break it at land.
- TypeScript's `runGit` treats a timed-out command as an ordinary failure: a read gives null, and a write fails with git's output. Rust gives `VcsError::TimedOut` from reads and writes alike, as the brief asks, so a caller can tell a hang from git's answer.
- The commands bounded by `git_commit` are the ones TypeScript runs through `runCommit`: `commit`, `commit-tree`, `merge` (plain and squash), `merge --abort` and `merge --ff-only`. The `add` and `rev-parse` around a commit, and the `config` read before `commit-tree`, use `git`, as in TypeScript.
- This change and 256 both scope `Cargo.lock`, so the scheduler starts this one only after 256 stops running.

## Contract

### Requirement: Git command

See `specs/rust-vcs/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-vcs/spec.md`: MODIFIED "Git command", which keeps both of its scenarios word for word and adds "Default timeouts", "Commands that run out of time" and "Commands that finish in time".
