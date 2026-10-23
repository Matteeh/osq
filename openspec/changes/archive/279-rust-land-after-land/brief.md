---
queue_item: rust-land-after-land
queue_hash: sha256:209e68c43b48fbb1ae5335773b596f2decf8863960eb7c13fb7eb2d2ee1abb7b
planner: null
date: 2026-10-22
---

### Goal

`vcs.afterLand` runs a command in the checkout after each land, such as a rebuild. Rust land skips it, so a Rust land leaves the checkout stale.

### Context

As of 2026-10-22:

- TypeScript runs it in `runAfterLand` in `src/core/vcs/land-after.ts`, records a failure under `~/.osq`, and `retryAfterLand` reruns it. The inbox shows the failure as an `after-land-failed` item.
- The config kernel reads `vcs.afterLand` (252). The harnesses kernel runs shell commands with a timeout (268).

### Requirements

- After a successful Rust land, the configured command runs in the checkout, and a failure is recorded in the file TypeScript reads, with its output, while the land itself still succeeds.
- An unset command leaves land's output as it is today.
- Tests use scratch repositories and commands that pass and fail.

### Non-goals

- Retrying the command; the inbox item for it is `rust-inbox-pending-items`.
