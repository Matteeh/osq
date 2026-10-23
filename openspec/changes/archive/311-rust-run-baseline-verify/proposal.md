---
title: The Rust run feature checks a task's verify_starts before the first attempt
depends_on: ["301"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-specs, rust-storage, rust-harnesses, rust-loop]
---
## Goal

TypeScript runs a task's verify once before its first attempt and kills
the task as `verify_precondition` when the result contradicts the task's
`verify_starts`, so a verify that proves nothing never certifies a task.
The Rust run starts pi without that check. This change ports
TypeScript's `runPreSpawnVerify` into the run feature: the pre-spawn
`verify_ran` event with its `phase`, `expected`, `missingPaths` and
`mismatch`, the log, and the dead marker, with no pre-spawn run on a
later attempt.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, every Rust test, the link gates and the mutation check of the
changed lines. It proves every `verify_starts` value against a passing
and a failing pre-spawn verify, the named-path rules, the marker, the
skip on a later attempt, and that every earlier run test still holds
with the task verify's log now second.

## Non-goals

- The change-level baseline, `gates.baselineVerify`, and its reuse by tree key.
- A `gates.preSpawnVerify` key in `osq.toml`, or a warn-only mode.
- A watch-log line for the pre-spawn start; `osq show` already words it from the event.
- A `duration` on the pre-spawn `verify_ran` event.

## Surface

None

## Decisions

- ADR 022: the change stays in the run feature crate; it copies the lint feature's named-path reading rather than calling it, and resolves patterns through the loop kernel's `scope_files`.
- ADR 023: the mismatch rule and the named-path reading are pure leaves; `after_lock` stays a thin orchestrator that calls one pre-spawn step.
- ADR 024: every public item ends its doc with `Implements: rust-run/<requirement>`, and each new test names `Covers: rust-run/<scenario>`.
- ADR 025: the `verify_ran` event, the `.run/logs/` file and the `verify_precondition` dead marker take TypeScript's formats.
- ADR 026: no OpenSpec parsing changes; `verify_starts` comes from the specs kernel's `read_task_file`.
- ADR 027: no scheduling changes.
- ADR 028: `RunFeature`'s commands are unchanged.
- ADR 029: the timeout and marker limits come from `load_config`; no config key is added.

## Assumptions

- Rust always kills a mismatch, as TypeScript does with `gates.preSpawnVerify: fail`; TypeScript's default `warn` only logs it. Under ADR 006 a gate blocks or is removed, and the brief asks for the death.
- The brief's "reuses the recorded baseline" means a later attempt runs no pre-spawn verify, as TypeScript skips it, and the first attempt's event stays the record; nothing reads a stored result back.
- The pre-spawn verify gets the timeout the Rust task verify gets, `timeouts.taskTimeoutSeconds`, where TypeScript uses `verifyTimeoutSeconds` for both, so a verify that times out after the run also times out before it.
- On a first attempt the task verify's log becomes `.run/logs/<task>-2.log`, as in TypeScript, so two run tests and the "Verify output from the config" table change their log names.

## Contract

### Requirement: Pre-spawn verify

See `specs/rust-run/spec.md`, "Pre-spawn verify", with the scenarios
"Pre-spawn verify outcomes", "Pre-spawn marker", "Pre-spawn named paths"
and "Pre-spawn verify on a later attempt".

### Requirement: Run verdict

See `specs/rust-run/spec.md`, "Run verdict": the task verify writes the
task's second log on a first attempt.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-run/spec.md`: ADDED "Pre-spawn verify"; MODIFIED "Run verdict", whose "Verify output from the config" rows now name `1-2.log`.
