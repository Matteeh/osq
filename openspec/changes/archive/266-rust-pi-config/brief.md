---
queue_item: rust-pi-config
queue_hash: sha256:0bf0992e45b6a817f81baffd7d1b76930a572b984c805bec66c06f86e5193634
planner: null
date: 2026-10-21
---

### Goal

`PiSettings` and the pi binary come from the caller, because no config reader existed when the pi harness landed. They should come from the `pi` block of `osq.toml`, with TypeScript's checks.

### Context

As of 2026-10-21:

- TypeScript validates `pi.bin`, `pi.provider`, `pi.model` and `pi.thinking` in `validatePiConfig` in `src/core/foundation/config-pi.ts`: each optional, each a non-empty string when given, trimmed.
- The config kernel (252, ADR 029) has no `pi` block. The harnesses kernel builds `PiHarness::new(bin, settings, kill_grace)` and `resolve_pi_binary` (251).

### Requirements

- The config kernel reads an optional `pi` table into typed settings with TypeScript's rules and messages, and rejects unknown keys as the rest of the kernel does.
- The harnesses kernel builds `PiSettings` and the resolved binary from those typed settings.
- Tests cover each field present, absent and blank.

### Non-goals

- osq doctor's pi checks.
- Other harnesses' settings.
