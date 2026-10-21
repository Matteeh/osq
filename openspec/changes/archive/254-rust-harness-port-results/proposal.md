---
title: The runners' Harness port carries a start's error and the harness version, so a caller never asks the adapter
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

The runners kernel's `Harness` port has no place for a start's error text
or for the harness program's version. So `PiHarness` keeps its failure
text, such as the missing-key hint, in its own `last_error()`, and the
version `preflight_pi` reads is dropped. A caller holding a
`Box<dyn Harness>` can reach neither.

This change gives `HarnessExit` an `error` field that `run_task` passes
through to `RunOutcome::Exited`, and gives the port a `harness_version()`
method for the `started` record. `PiHarness` fills the exit's `error` as
`last_error()` does today, and `last_error()` is removed. It also takes the
version from the `PiReady` that `preflight_pi` returns. TypeScript works
the same way: `PiAdapter.spawn` returns `error` in its result and passes
`harnessVersion` through `onSpawn`.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the ignored ones, and the mutation check on the lines this change touches.
This covers the runners' fake-harness tests and the harnesses' fake-pi
tests. The real-pi test returns at once unless `OSQ_PI_INTEGRATION=1`, so
the verify needs no model, key or network.

## Non-goals

- Writing the `started` event to a file. That is the run feature's work: it reads `harness_version()` from the harness it starts.
- Other harness adapters, and a version probe inside `PiHarness::start`.
- Changing how the runner judges or retries a start. A failed start's error still comes from the `StartError` or the open retry event, never from the exit's `error`.

## Surface

None

## Decisions

- ADR 022: the harnesses kernel still depends on the runners kernel to implement its port, and runners never depends on harnesses; no feature crate changes.
- ADR 023: `PiHarness::failure` stays a pure private function that now fills the exit's `error`. `with_preflight` and `harness_version` are small named functions with doc comments.
- ADR 024: every function that implements a requirement ends its doc with `Implements: rust-runners/harness-and-model-per-role` or `Implements: rust-harnesses/pi-harness`, and every new test names `Covers: <capability>/<scenario>`.
- ADR 025: the `error` text and version are the same values TypeScript's pi adapter gives. Core's `StartedData.harness_version` is unchanged.
- ADR 026: no OpenSpec work.
- ADR 027: the kernels decide nothing about scheduling.
- ADR 028: no feature crate changes; `Feature` is untouched.

## Assumptions

- `harness_version()` is a required port method with no default body, so each adapter states its version. The fake harness in the runners tests and `PiHarness` are its only implementors today.
- `PiHarness` takes its version from a `PiReady` the caller passes in, and does not probe `pi --version` on every start as TypeScript's `spawn` does. In Rust the caller already runs `preflight_pi` before it starts pi.
- A blank preflight version reads as `None`, as TypeScript records `harnessVersion` only when its probe returned text.

## Contract

The deltas in `specs/rust-runners/spec.md` and `specs/rust-harnesses/spec.md` hold the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-runners/spec.md`: MODIFIED "Harness and model per role". It adds `harness_version()` to the port and `error` to `HarnessExit`, keeps every scenario, and adds "Exit error and harness version".
- `specs/rust-harnesses/spec.md`: MODIFIED "Pi harness". `last_error()` becomes the exit's `error`, and `with_preflight` and `harness_version()` are added. Every scenario is kept with `last_error()` read as the exit's `error`, and "Pi harness version" is added.
- One task owns every file. The port change breaks the crate that implements it, so the two crates cannot change in separate tasks and keep the change-level verify green.
