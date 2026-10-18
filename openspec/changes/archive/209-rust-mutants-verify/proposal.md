---
title: A Rust change's verify fails on a missed mutant in the lines it changed
depends_on: []
verify: pnpm verify
features:
  reads: [version-control]
---
## Goal

Since 208, Rust CI fails a push whose diff has a missed mutant. But osq lands
on main locally and pushes afterwards, so CI reports the miss only after the
change has landed, and nobody fixes it inside the task that wrote the code.

After this change, every verify osq runs for a change gets `OSQ_DIFF`, the
path of a temporary file holding the change's diff since `.run/base`,
untracked files included. osq writes it with the `vcs.patch` read it already
uses for dead tasks' patches, so the verify command never runs git: osq
alone touches git (ADR 003), and `OSQ_` variables already reach the verify
role (ADR 007). `scripts/verify-rust.sh`, the verify of every Rust change,
then runs `scripts/mutants-rust.sh` on that diff after the tests. A missed
mutant in the change's own lines fails the task's change-level verify, so
the executor adds the missing test inside its task. In CI and by hand, with
no `OSQ_DIFF`, the script says the mutation check did not run and passes, as
before; CI's own `mutants` job still checks each push.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree,
including `tests/verify-diff.test.ts` against temporary git repositories,
`tests/rust-verify-script.test.ts` against `scripts/verify-rust.sh` with a
recording `cargo` stub, and the updated `tests/rust-agent-guide.test.ts`. No
test needs `cargo`.

## Non-goals

- Making osq's TypeScript mutation check (`traceability.mutation`) cover Rust.
- A new dead reason. A missed mutant fails verify like any failing check.
- Filtering the diff to Rust files in osq. cargo-mutants reads only the `.rs`
  files a diff touches and skips the rest, binary hunks included.
- Giving the agent role `OSQ_DIFF`. An executor checks a file by hand with
  `cargo mutants -p <package> -f <file>`.
- Any change to Rust CI or `scripts/mutants-rust.sh`.

## Surface

- Added: `OSQ_DIFF` in every verify's environment when the change has a base commit (environment variable)
- Changed: `scripts/verify-rust.sh` runs `scripts/mutants-rust.sh` on `OSQ_DIFF` after the tests, and prints `mutation check not run: OSQ_DIFF is not set` without it (command)
- Changed: AGENTS.md's `## Rust crates` section gains a mutation check bullet (document section)

## Decisions

- ADR 001: config loading is untouched.
- ADR 002: archive's delta merge is untouched.
- ADR 004: the OpenSpec validator invocation is untouched.
- ADR 005: the peer range rule is untouched.
- ADR 010: the validator role is untouched.
- ADR 012: the watch service is untouched; the running watcher picks up the new verify environment when its supervisor restarts it on the new build after land.
- ADR 015: `osq mcp` is untouched.
- ADR 018: the steering planner is untouched.
- ADR 019: the tapped planner is untouched.
- ADR 021: autopilot is untouched.
- ADR 022: no crate or crate dependency changes.
- ADR 023: the workspace lints and the fmt, clippy and test steps of `verify-rust.sh` stay as they are.
- ADR 024: this carries out the next step of its mutation bullet, part of osq's verify for Rust changes, so agents fix misses inside the task.
- ADR 025: no on-disk format changes; the diff file is temporary and outside the project.
- ADR 026: no OpenSpec code is touched.

## Assumptions

- `vcs.patch(base)` already gives the diff verify needs: a temporary index, `git add -A`, then `git diff --cached --binary <base>`, so untracked files are in it and the real index never changes. Checked on 2026-10-18 that cargo-mutants 27.1.0 reads such a diff with binary hunks and `.run/` event files in it, listing only the mutants of the `.rs` lines.
- A full rust-core run takes 4 minutes with 4 jobs, inside the 600-second `verifyTimeoutSeconds`. A change's own diff makes fewer mutants than that, so its verify should fit too. A large Rust change that does not fit fails as a timeout, and the fix is a higher `timeouts.verifyTimeoutSeconds` in `osq.config.ts`.
- The diff runs from the change's base, so each later task's change-level verify mutates the earlier tasks' lines again. That repeats work, but it also catches a later task that breaks an earlier test, and it keeps one rule for task, archive and retry verifies.
- Measured on 2026-10-18 in a scratch worktree of main at `5acad091` with a prototype of task 1: `pnpm test` passed 4,270 of 4,283 tests in 2m50s. The 8 failures were all build and pack tests, because the scratch worktree had no `dist/`. None of the 26 tests that import `verification.ts` failed, so no preexisting test needs to change.
- The watcher runs from `dist`, so this change's own Rust-free run uses the old verify environment. The mutation step first applies to the next Rust change, the storage kernel.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: MODIFIED "Change folder in verify environment", keeping both scenarios and adding "Verify gets the change's diff" and "No diff without a base".
- `specs/rust-core/spec.md`: ADDED "Verify script mutation step"; MODIFIED "Code ownership", adding `tests/rust-verify-script.test.ts`.
- `specs/cli-foundation/spec.md`: MODIFIED "Rust guide for agents", adding three terms to its table.

No file is shared between tasks.
