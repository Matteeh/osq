---
queue_item: rust-run-verify-tail
queue_hash: sha256:f981e33a4f6f11582389a26e65dd963690741f53462f48d4f22b6b283550fd8b
planner: null
date: 2026-10-23
---

### Goal

Every limit comes from config. The Rust run verdict cuts verify output to a hard-coded 2000-byte tail, where TypeScript uses the line and character limits that 289 gave the Rust config.

### Context

As of 2026-10-23:

- Rust: `OUTPUT_TAIL_BYTES` in `crates/features/run/src/feature/verdict.rs`.
- TypeScript: `tailVerifyOutput` and `excerptVerifyOutput` in `src/core/run/verify-excerpt.ts`, using `limits.markerOutputLines` and `limits.markerLineChars`.
- 289 added `marker_output_lines` and `marker_line_chars` to `Config.limits` in `crates/kernel/config/src/blocks/limits.rs`, with TypeScript's defaults 40 and 400. `rust-land-limits` (303) makes the same fix in land.

### Requirements

- The Rust run cuts verify output in dead markers and events as TypeScript does, with the sizes from `config.limits`, and no tail size is a constant in the run crate.
- A test sets each key to a small value in `osq.toml` and sees the shorter excerpt.

### Non-goals

- Tail sizes in other crates.
