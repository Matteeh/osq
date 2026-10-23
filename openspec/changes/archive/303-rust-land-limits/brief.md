---
queue_item: rust-land-limits
queue_hash: sha256:428e28802ec953a0997b526fbeba82f5863f7354ad216606c05c869f83959832
planner: null
date: 2026-10-22
---

### Goal

Every limit comes from config. Rust land still holds TypeScript's tail sizes as constants: `OUTPUT_TAIL_LINES = 20` in `crates/features/land/src/land/after.rs` (279), and the 20-line command tail and 40-line, 400-character verify excerpt that `rust-land-sync` added. 289 has since given the Rust config the `limits` block they belong to.

### Context

As of 2026-10-23:

- TypeScript reads `limits.cardOutputLines` in `src/core/vcs/land-after.ts`, `sync-verify.ts` and `sync-lockfiles.ts`, and `limits.markerOutputLines` and `limits.markerLineChars` in `src/core/run/verify-excerpt.ts`.
- 289 added `card_output_lines`, `marker_output_lines` and `marker_line_chars` to `Config.limits` in `crates/kernel/config/src/blocks/limits.rs`, with TypeScript's defaults 20, 40 and 400.

### Requirements

- Rust land takes every output tail size from `config.limits`, and no tail size is a constant in the land crate.
- The living rust-land requirements that name 20, 40 or 400 name the limits keys instead, keeping their scenarios.
- A test sets each key to a small value in `osq.toml` and sees the shorter tail.

### Non-goals

- Tail sizes in other crates.
