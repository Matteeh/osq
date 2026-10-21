---
queue_item: rust-harness-process
queue_hash: sha256:9d5b99137f0e7f5b3044b4f1822f571c9683998d21f99553be34008153645d7b
planner: null
date: 2026-10-20
---

### Goal

Running a task in Rust needs a harness. The harnesses kernel gets the part every harness shares, starting a process with a declared environment and a timeout and reading its output line by line, and one adapter: pi, today's executor harness.

### Context

As of 2026-10-21:

- `crates/kernel/harnesses` is a placeholder. TypeScript: `src/harness/process.ts` (`spawnWithTimeout`, kill grace period), `src/harness/stream.ts` (line parser), `src/harness/pi/pi-stream.ts` (`processPiStdoutLine`) and `pi-args.ts`, `src/core/run/role-env.ts` (`buildRoleEnv`, ADR 007).
- Core's `Event` enum already has `Tool`, `Text`, `Tokens`, `FileChanged`, `Started` and `Exited`.
- Architecture: runners own what every harness shares (model per role, retries, the usage-limit pause); a harness only starts its tool, passes the prompt and returns the result.

### Requirements

- A process runner starts a program with exactly the environment it is given (ADR 007), a working folder and a timeout, kills it after the grace period when the timeout passes, and returns its exit code, whether it timed out, and each stdout line as it arrives.
- The pi adapter builds pi's arguments as `pi-args.ts` does and turns pi's stdout lines into core events as `processPiStdoutLine` does. A golden test runs recorded pi output, committed as a fixture, through it and compares with the events TypeScript writes for the same lines, printed once and committed.
- The runner is tested with a small script as the program: exit codes, timeout and kill, and environment isolation.
- No new crate dependency, unless it goes through the dependency gate with its ADR.

### Non-goals

- Other harnesses (claude, codex, opencode, agy), the usage-limit pause, retries and model choice, which belong to runners.
- Writing events to files.
