---
title: The Rust harnesses kernel runs a verify command as osq's verify role
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-runners]
---
## Goal

osq trusts nothing an agent says: `done` needs osq's own verify run. Rust has
no verify runner yet, and the run feature needs one. This change adds
`run_verify` beside `run_process` in the harnesses kernel. It runs a verify
command as TypeScript's `runVerificationCommand` does: through the shell, in
its own process group, with exactly the verify role's environment plus
`OSQ_CHANGE` and `OSQ_DIFF`, bounded by a timeout. It gives the exit code, the
timed-out flag, the duration and the combined output.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the corpus link gates included, so it proves the new
verify tests pass and the process runner's tests still do.

## Non-goals

- Mutation testing, focused tests and the verify log file format.
- Writing the diff file `OSQ_DIFF` names; the caller passes its path.
- The prepare role's commands.

## Surface

None

## Decisions

- ADR 007: verify gets only the verify role's names; a configured name that is also an agent name, such as the model key, is dropped by `role_env`.
- ADR 022: the verify runner is kernel code the run feature will call; no feature changes.
- ADR 023: the path rewrite and outcome mapping are pure leaves; `run_verify` is the orchestrator that starts the process.
- ADR 024: every public item ends its doc with `Implements: rust-harnesses/<requirement>`, and each test names `Covers: rust-harnesses/<scenario>`.
- ADR 025: no on-disk format changes.
- ADR 026: no spec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: no `Feature` changes.
- ADR 029: the timeout and kill grace come from the caller, who reads them from config.

## Assumptions

- The brief names the runners kernel, but the process code lives in the harnesses kernel, and the runners kernel cannot depend on it, since harnesses already depends on runners. So the verify runner sits in harnesses and calls the runners kernel's `role_env`.
- A timed-out run gives exit code 1, as TypeScript's does, not the 124 that `run_process` gives a harness.
- The output keeps blank lines and both streams, unlike `run_process`'s line callback, since TypeScript's verify output does.

## Contract

### Requirement: Verify command

See `specs/rust-harnesses/spec.md`, with "Verify environment" and "Verify
outcome".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-harnesses/spec.md`: ADDED "Verify command", "Verify environment" and "Verify outcome".
