---
title: The harnesses kernel starts a harness process with its role's environment and turns pi's stream into core events
depends_on: ["239"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core]
---
## Goal

Running a task in Rust needs a harness. `crates/kernel/harnesses` is a
placeholder today. This change gives it the part every harness shares and
its first adapter, pi, today's executor harness.

`run_process` starts a program with exactly the environment it is given
(ADR 007), a working folder and an optional timeout. It passes each stdout
line to the caller as it arrives, asks the program to stop with `SIGTERM`
when the timeout passes and kills it after the grace period, and returns
the exit code, whether it timed out, and stderr, as TypeScript's
`spawnWithTimeout` and `EventStreamParser` do.

`pi_args` builds pi's arguments as `buildPiArgs` does, and
`pi_line_events` turns pi's stdout lines into core `Event`s as
`processPiStdoutLine` does. Two golden tests run committed pi output, the
captured run from `tests/fixtures/pi/run.jsonl` and a file of edge lines,
through it and compare with the events TypeScript wrote for the same
lines. The planner printed those once and committed them in this folder's
`golden/`.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test, and
the mutation check on the lines this change touches. That covers the
runner's script tests, the pi argument table and both golden stream
tests.

## Non-goals

- Other harnesses (claude, codex, opencode, agy).
- Model choice per role, retries and the usage-limit pause, which belong to the runners kernel.
- Building a role's environment from config, TypeScript's `buildRoleEnv`; the caller passes the environment in.
- Running pi end to end: finding its binary, the version probe and preflight, the kill after `agent_settled`, and the missing-key hint.
- Writing events to files, and giving them timestamps.
- Changing the TypeScript harnesses or any other crate.

## Surface

None

## Decisions

- ADR 022: `osq-kernel-harnesses` stays a kernel crate on `osq-core` alone, adding only the workspace's `serde_json`; it returns core `Event`s and no feature calls it yet.
- ADR 023: `run_process` is the thin orchestrator holding the process IO; the summary, root stripping, relative path, token and argument rules are pure leaves, and every item has a doc comment.
- ADR 024: every public function's doc ends with `Implements: rust-harnesses/<requirement>`, and every test names `Covers: rust-harnesses/<scenario>`.
- ADR 025: the adapter reads pi's stream as pi writes it today and gives the event types and fields today's `.run/events/<n>.jsonl` holds.
- ADR 026: no OpenSpec parsing is involved.
- ADR 027: no scheduling is involved; the change holds only the harnesses crate and `Cargo.lock`.

## Assumptions

- The runner asks the program to stop by running the system `kill -TERM <pid>` utility and kills it with `kill -KILL <pid>`, so no crate such as `libc` is added. This is Unix only, as osq's Rust build is today.
- The events carry no timestamp. TypeScript stamps a pi line with its top-level `timestamp` or the current time, and pi's tool and message lines carry none, so the writer, a later change, gives the time.
- For a tool other than pi's own seven, the summary is serde_json's compact text of `args`, whose keys come out sorted, while TypeScript keeps their written order. The two agree whenever `args` has at most one key; pi runs with `--no-extensions`, so other tools are rare.
- The 60-character cut counts Unicode characters, where TypeScript counts UTF-16 units; they differ only for characters outside the Basic Multilingual Plane, such as emoji.
- A count that is not a whole number of at least 0 counts as absent, because core's `TokensData` and `HarnessRetryData` hold whole numbers. TypeScript would write `1.5`, which core cannot read back anyway.
- `CARGO_MANIFEST_DIR` is set in a test's own environment when cargo runs it, so the runner test can show that a variable of the calling process does not reach the child.

## Contract

### Requirement: Process runner

See `specs/rust-harnesses/spec.md`.

### Requirement: Pi arguments

See `specs/rust-harnesses/spec.md`.

### Requirement: Pi stream events

See `specs/rust-harnesses/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-harnesses/spec.md`: ADDED "Process runner", "Pi arguments" and "Pi stream events".

Tasks 1 and 2 share `crates/kernel/harnesses/src/lib.rs`; task 2 runs after task 1.

The fixtures in `fixture/` and the goldens in `golden/` are copied into the crate by task 2. `fixture/pi-run.jsonl` is a byte copy of `tests/fixtures/pi/run.jsonl`; `fixture/pi-edges.jsonl` was written for this change. Each golden entry is `{ line, type, data }` for one event `processPiStdoutLine` wrote with the project root `/work/project`.
