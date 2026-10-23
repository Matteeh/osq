---
title: The pi preflight test runs its fake pi in place instead of copying it
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

`crates/kernel/harnesses/tests/pi_preflight.rs` copies `tests/fixtures/fake-pi/preflight.sh` into a temporary folder, sets mode 755 and runs it. That is the pattern that failed 251's cargo-mutants baseline with `ETXTBSY` ("Text file busy"): while tests run in parallel, another thread's fork can still hold the new file open for writing when this thread starts it. Copying and then running failed 5 of 40 runs, while running the committed executable in place failed 0 of 60.

`crates/kernel/vcs/tests/git_timeouts.rs`, added by 257, writes its fake git script at test time in the same way, and holds a `SPAWN_LOCK` mutex to work around it.

After this change both fakes are committed executables that the tests run in place, and no test under `crates/` writes or copies a file and then runs it.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, `cargo clippy` with `-D warnings` and pedantic lints, and every Rust test, including the preflight and git timeout tests on their in-place fakes and the new tests that check each fake's mode.

## Non-goals

- Changing `preflight_pi`, `PiHarness` or `GitVcs` themselves.
- Changing what any fake prints or how it exits.

## Surface

None

## Decisions

- ADR 022: only test files and test fixtures in `osq-kernel-harnesses` and `osq-kernel-vcs` change; no crate gains or loses a dependency.
- ADR 023: no core code changes.
- ADR 024: every new test names `Covers: rust-harnesses/fake-pi-programs-run-in-place` or `Covers: rust-vcs/fake-git-runs-in-place`, and the changed tests keep their `Covers:` lines.
- ADR 025: no config key changes; the timeout rows keep their own `Timeouts` values.
- ADR 026: nothing here parses OpenSpec.
- ADR 027: nothing here schedules.
- ADR 028: no feature changes.
- ADR 029: the config kernel is untouched.

## Assumptions

- The executable bit reaches git through osq's own commit of the task: this repository has `core.fileMode` set to `true`, so `chmod +x` on `preflight.sh` and on the new `fake-git.sh` is staged as mode 100755. Each task's new mode test fails in verify if the bit is missing.
- `preflight_pi` takes the program as a path, and so does `GitVcs::with_program`, so no test needs a program named `pi` or `git` on a `PATH`. The rule about symlinks and `PATH` entries is in the spec for later tests.
- The fake pi writes `auth-args.txt` into its working directory, which is the row's temporary folder, so running it in place leaves the fixture folder clean. The fake git writes nothing.
- `git_timeouts.rs` falls under the brief's "no other test under `crates/` copies a file and then executes it". Its script moves verbatim into `crates/kernel/vcs/tests/fixtures/fake-git.sh`, and `SPAWN_LOCK` goes, since nothing is written any more. The timeout rows still each get their own folder under `CARGO_TARGET_TMPDIR` as the `GitVcs` root.
- A search of `crates/` found no other test that runs a file it wrote or copied. `archive_move.rs` changes a file's mode but never runs it, and the other tests run `git`, `node` or the test binary itself.
- `pi_harness_run.rs` already runs `run.sh` in place since 251, so it does not change. Only the spec's "Pi tasks with a fake pi" WHEN line, which still said the fake is copied, is brought up to date.

## Contract

### Requirement: Pi preflight

See `specs/rust-harnesses/spec.md`.

### Requirement: Pi harness

See `specs/rust-harnesses/spec.md`.

### Requirement: Git command

See `specs/rust-vcs/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-harnesses/spec.md`: MODIFIED "Pi preflight", which keeps its two scenarios, runs the fake in place in "Preflight with a fake pi", and adds "Fake pi programs run in place". MODIFIED "Pi harness", whose "Pi tasks with a fake pi" runs `run.sh` in place; its other scenarios are unchanged.
- `specs/rust-vcs/spec.md`: MODIFIED "Git command", whose fake git is the committed `crates/kernel/vcs/tests/fixtures/fake-git.sh`, keeping its five scenarios and adding "Fake git runs in place".

The two tasks share no file.
