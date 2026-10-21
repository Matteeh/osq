---
title: "The harnesses kernel runs pi end to end: finds the binary, checks its version and credentials, and stops it when the agent settles"
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: ["rust-runners"]
---
## Goal

242 gave the harnesses kernel the process runner, `pi_args` and the
stdout-to-events parser. The runners kernel has a `Harness` port and no
adapter yet. This change makes pi run a real task in Rust, as TypeScript's
`src/harness/pi/pi.ts` does, so the runners kernel can start pi for a role.

Task 1 adds the preflight: `resolve_pi_binary` as `resolvePiBinary`
resolves the binary, `assess_pi_version` as `assessPiVersion` assesses a
version, and `preflight_pi`, which probes `pi --version` and runs `pi auth
check` as `preflightPi` does. The tested range, timeouts and setting come
from the caller, since Rust has no config reader yet. Task 2 adds
`run_process_until`, a process run that stops the program a grace period
after a line asks it to, and `PiHarness`, which implements the runners'
`Harness` port on top of it. `PiHarness` turns pi's stdout into core events,
stops pi after `agent_settled`, and gives TypeScript's missing-key hint.
Tests run a fake `pi` shell script. One ignored test runs real pi, and only
when `OSQ_PI_INTEGRATION=1`.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the ignored ones, and the mutation check on the lines this change touches.
That covers the harnesses kernel's tests against the fake pi scripts in
`crates/kernel/harnesses/tests/fixtures/fake-pi/`. The real-pi test runs
too, but returns at once unless `OSQ_PI_INTEGRATION=1`, so the verify needs
no model, key or network.

## Non-goals

- Other harnesses: claude, codex, opencode, agy and the mock.
- Model choice per role, role environments, start retries and the usage-limit pause, which are the runners kernel's work.
- Reading `osq.config.ts` or `osq.toml`, and a default tested range: the caller passes the binary setting, timeouts and range.
- The harness version on the start record, which TypeScript's `spawn` probes for `onSpawn`; the runners' port has no place for it yet.
- `osq doctor`'s pi checks (`diagnosePi`), `PiAdapter.setup` (pi writes no files) and CLI wiring.

## Surface

None

## Decisions

- ADR 007: `PiHarness` gives pi exactly the request's `env`, and `preflight_pi` gives its programs exactly the caller's `env`; nothing in `src/` of the crate reads the process's own environment, and only the ignored real-pi test does.
- ADR 022: the harnesses kernel depends on the runners kernel to implement its `Harness` port; no feature crate is involved, and runners does not depend on harnesses.
- ADR 023: resolving the binary, assessing a version, reading the auth object, the error texts and `last_error` are pure private functions; `preflight_pi`, `PiHarness::start` and the runner's receive loop alone start programs.
- ADR 024: every public function's doc and every function that implements a requirement ends with `Implements: rust-harnesses/<requirement>`, and every test names `Covers: rust-harnesses/<scenario>`.
- ADR 025: pi's `--mode json` stream, `--version` text and `auth check --json` object are read as today's pi writes them, and task 3 makes `RecertificationData.output` optional because TypeScript's sync recertification writes the event without it.
- ADR 026: no OpenSpec work.
- ADR 027: the kernel decides nothing about scheduling.
- ADR 028: no feature crate changes; `Feature` is untouched.

## Assumptions

- The version warning is returned in `PiReady.warning`, not printed; the caller prints it, as TypeScript's `console.warn` does.
- When `pi auth check` fails with no `reason` field, the reason is `pi auth check timed out` or `pi auth check exited with code <n>`, not Node's `execFile` message (`Command failed: …`), which Rust cannot reproduce.
- `last_error()` after a failed start uses stderr only. TypeScript falls back to stdout, which for pi is the JSON event stream and already became events.
- The runners' `HarnessExit` has no error field, so `PiHarness::last_error()` is how a caller reads the missing-key hint until the runners port carries one.
- After `agent_settled`, TypeScript sends `SIGTERM` once and nothing more. `run_process_until` also sends `SIGKILL` one `kill_grace` later, as the runner already does after a timeout, so a pi that ignores `SIGTERM` cannot hold the task until its timeout.
- TypeScript uses `harnessKillGracePeriodMs` both as the settle grace and as the kill grace; `PiHarness` takes one `kill_grace` for both.
- The fake pi scripts run under `/bin/sh` with only the variables each test gives, and use only shell builtins and `sleep`, as the existing process runner tests do.
- `crates/kernel/harnesses/src/lib.rs` and `crates/kernel/harnesses/src/pi.rs` are shared: task 1 writes them first, and task 2 extends them. Task 2's scope globs `src/*.rs` and `tests/*_run.rs`, which take none of task 1's files except those two.
- `Cargo.lock` is shared with every other change that adds a crate dependency; only task 2 scopes it.
- Task 3 was added by steering after the change-level verify regressed: syncing main changed `Cargo.lock`, osq recertified task 2 and wrote a `recertification` event with no `output`, and the schedule corpus test could not read it. Task 3 scopes `crates/core`, which the scheduler locks as a whole while it runs.
- Task 4 was added by a second steering after cargo-mutants' baseline at archive failed `pi_start_arguments_and_defaults`: copying the fake pi and running it races with other test threads (`Text file busy`), 5 of 40 trial runs failed. Running the committed executable `run.sh` in place removed the race in a trial.

## Contract

The delta in `specs/rust-harnesses/spec.md` holds the contract.

## Human steps

### Before approval

None

### After landing

- To run the real-pi test against your pi and key: `OSQ_PI_INTEGRATION=1 OSQ_PI_PROVIDER=deepseek cargo test -p osq-kernel-harnesses --test real_pi_run -- --ignored`.

## Delta

- `specs/rust-harnesses/spec.md`: ADDED Process stop after a line, Pi binary, Pi version assessment, Pi preflight, Pi harness.
- `specs/rust-core/spec.md`: MODIFIED "Event types" (`recertification` `output` becomes optional, scenarios kept) and "Event lines round-trip" (adds "Sync recertification without output").
- Shared files: `crates/kernel/harnesses/src/lib.rs` and `crates/kernel/harnesses/src/pi.rs`, owned by task 1 and extended by task 2; `crates/kernel/harnesses/tests/pi_harness_run.rs`, owned by task 2 and changed by task 4.
