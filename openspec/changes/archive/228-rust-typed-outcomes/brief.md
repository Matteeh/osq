---
queue_item: rust-typed-outcomes
queue_hash: sha256:f26d60f3c54ddcd89ec0677e626ca9a34d84f29703187a4e7364064a216eb98c
planner: null
date: 2026-10-20
---

### Goal

A misspelled dead reason or outcome fails to compile in Rust instead of passing silently, and every reader matches on the full set.

### Context

As of 2026-10-19:

- `crates/core/src/event/payload.rs` holds `reason` and `outcome` as `String` or `Option<String>` on about ten payloads, among them `dead`, `retry`, `regressed`, `recertification`, `baseline_ran`, `focused_ran`, `mutation_ran`, `validator_ran`, `auto_steer_ran` and `verification_recorded`.
- TypeScript's dead reasons are `RunTaskFailureReason` in `src/watcher/failure-reason.ts`. The archive also holds older values, such as `verify_failed`, that today's TypeScript no longer writes. rust-core "Archived event logs round-trip" requires every archived line to parse and write back to the same JSON value.
- ADR 025: an unknown event `type` is a read error, and the format grows additively. An enum makes a new reason that TypeScript writes a Rust read error too, so a new reason needs both sides, as `exit_continued` did in 220.

### Requirements

- Each such field becomes an enum whose variants are exactly the values TypeScript writes today plus every value found in the archive, each serialized as its existing string.
- The archive round-trip corpus test and the storage golden rows stay equal.
- rust-core "Event types" names each enum's values, so a new value is a spec change.

### Non-goals

- Changing TypeScript's reasons or outcomes.
- Free-text fields such as `error`, `output` and `note`.
