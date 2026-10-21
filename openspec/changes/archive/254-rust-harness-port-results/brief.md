---
queue_item: rust-harness-port-results
queue_hash: sha256:7ea8a6b63118ad39aacdd1dd2b1d0aea4859de4dd1d1600dd56aa8ef4c207e05
planner: null
date: 2026-10-21
---

### Goal

`PiHarness` keeps its failure text in `last_error()` and drops pi's version, because the runners' `Harness` port has no place for either. The port should carry both, so the run feature reads them from the result and the start record, as TypeScript does.

### Context

As of 2026-10-21:

- `HarnessExit` in `crates/kernel/runners/src/run.rs` holds only `exit_code` and `timed_out`; `RunOutcome` carries what `run_task` saw.
- `PiHarness::last_error()` in `crates/kernel/harnesses/src/pi/harness.rs` holds the missing-key hint and other failure text (251).
- TypeScript's `PiAdapter.spawn` probes `pi --version` and passes `harnessVersion` through `onSpawn` to the `started` record; core's `StartedData` already has an optional `harness_version`.

### Requirements

- `HarnessExit` carries the start's error text when it has one, `run_task` carries it into `RunOutcome`, and `PiHarness` fills it as `last_error()` does today; `last_error()` goes.
- The port gives the harness version for the start record, and `PiHarness` gives the version its preflight read.
- Tests on fake harnesses and the fake pi cover an exit with and without an error, and a start with and without a version.

### Non-goals

- Writing the `started` event to a file; the run feature does that.
- Other harness adapters.
