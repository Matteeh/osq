---
title: The Rust osq doctor checks pi as TypeScript does
depends_on: ["271"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-harnesses]
---
## Goal

The executor runs on pi, and a wrong pi version or a missing provider key
fails every task. TypeScript's `osq doctor` catches both; Rust's doctor
feature is still empty. This change gives `DoctorFeature` its `doctor`
command. It reads `osq.toml` through the config kernel, probes
`pi --version`, assesses it against TypeScript's tested range, and runs
pi's auth check for the configured provider. It prints TypeScript's
`config`, `harness`, `harness-version` and `harness-auth` lines and fails
when any of them fails.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves the doctor rows pass against the
committed fake pi, and that `osq-rs doctor` dispatches through the
registry, which already lists `DoctorFeature`.

## Non-goals

- Doctor's other checks: harness containment, managed blocks, decisions, locks, archives, done markers, the OpenSpec validator, git, languages, prices and the validator's harness and model.
- Checks for any harness but pi; with another harness, doctor prints only the config line.
- The JSON provider name in pi's auth answer; the line names the configured provider.

## Surface

- Added: `osq-rs doctor` (command).

## Decisions

- ADR 022: doctor stays in its own feature crate and calls only the config and harnesses kernels.
- ADR 023: line formatting is pure functions; one orchestrator reads the config and starts pi.
- ADR 024: every public item ends its doc with `Implements: rust-doctor/<requirement>`, and each test names `Covers: rust-doctor/<scenario>`.
- ADR 025: doctor reads today's `osq.toml` and writes no file.
- ADR 026: doctor reads no OpenSpec file.
- ADR 027: no scheduling changes.
- ADR 028: `DoctorFeature` stays a unit struct and gains one `Command`.
- ADR 029: the binary, provider and both timeouts come from `Config`; the tested range is TypeScript's `PI_TESTED_RANGE` constant, held in the doctor crate as TypeScript holds it in code.

## Assumptions

- The text inside `binary unavailable: <bin> (...)` is Rust's, not Node's: the runner's start error, `timed out`, or `exited with code <n>`. Node's `execFile` messages can't be reproduced.
- A failing doctor prints its lines on stderr after `doctor failed: `, because a failing feature command returns an error message, as lint does; TypeScript prints them on stdout.
- The auth check runs through `preflight_pi`, which probes `--version` a second time. That keeps the harnesses kernel unchanged.
- Doctor passes pi the whole process environment, as TypeScript's `execFile` does; it is a check the human runs, not a spawned role.

## Contract

### Requirement: Doctor pi checks

See `specs/rust-doctor/spec.md`, with "Doctor command" and "Doctor
arguments".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-doctor/spec.md`: REMOVED "Doctor feature"; ADDED "Doctor command", "Doctor arguments" and "Doctor pi checks".
- `fixture/fake-pi/doctor.sh` is the fake pi task 1 copies to `crates/features/doctor/tests/fixtures/fake-pi/doctor.sh`.
