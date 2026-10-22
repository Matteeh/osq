---
queue_item: rust-doctor-pi
queue_hash: sha256:28e3ec22031053219fdf35c854cf2972d401525952a7cb474ac94e6a6578a5cc
planner: null
date: 2026-10-22
---

### Goal

The executor runs on pi, and a wrong pi version or a missing provider key fails every task. Rust should give TypeScript's `osq doctor` pi checks, from the pi settings in `osq.toml`.

### Context

As of 2026-10-22:

- TypeScript checks pi in `diagnosePi` and `assessPiVersion` in `src/core/foundation/config-pi.ts`, against the tested range `PI_TESTED_RANGE`, and prints through `src/cli/doctor.ts`.
- 266 gives `PiConfig` and `PiHarness::from_config`. 251 gives the pi preflight that reads `pi --version`.
- `rust-feature-scaffolds` gives an empty `osq-feature-doctor` crate.

### Requirements

- `osq doctor` in Rust prints the pi lines TypeScript prints for a pi in range, out of range, missing, and with or without the provider's key, and exits non-zero when a check fails.
- Tests use the committed fake pi from 260.

### Non-goals

- Doctor's checks for other harnesses, git, Node or the watcher.
