---
queue_item: rust-verify-command
queue_hash: sha256:a0bd1c1d92a6421b2fed61ca13e347e4c6b7c5faabd852ac8f31e9dc7a37519e
planner: null
date: 2026-10-21
---

### Goal

osq trusts nothing an agent says; `done` needs osq's own verify run. Rust has no verify runner yet, and the run feature needs one.

### Context

As of 2026-10-21:

- TypeScript runs verify in `runVerificationCommand` in `src/core/run/verification.ts`: a shell command in the task's tree, with the verify role's environment (ADR 007: never the model key), a timeout from config, and output kept for the log and excerpt.
- The runners kernel has `role_env` with `EnvRole::Verify` (246), and the harnesses kernel has `run_process` with timeouts and kill grace (242).

### Requirements

- The runners kernel runs a verify command through the shell in a given directory, with exactly the verify role's environment plus the variables osq passes (`OSQ_CHANGE`, `OSQ_DIFF`), bounded by a given timeout, and gives exit code, timed-out flag and the combined output.
- Tests run small `sh -c` commands, including one that would print a model key if it were passed.

### Non-goals

- Mutation testing, focused tests and the verify log file format.
