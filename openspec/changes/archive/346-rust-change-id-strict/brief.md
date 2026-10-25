---
queue_item: rust-change-id-strict
queue_hash: sha256:e6469d0bf12391c9617d6c2b3fd7ca219dcfee715fc426baca3671bf3347572e
planner: null
date: 2026-10-25
---

### Goal

On 2026-10-23 `osq land 310]` landed 310. TypeScript's `matchesFolder`, and Rust ports such as `padded()` in `crates/features/land/src/land/find.rs`, keep only the leading digits, so `310]`, `310x` and `310-wrong-slug` all match 310, and `31O` matches 031. Rust should accept only a real id and refuse anything else.

### Context

As of 2026-10-24:

- Each Rust feature crate matches ids on its own (land, retry, show, approve, plan, archive, inbox).
- This is an improvement over TypeScript, which stays as it is.

### Requirements

- One kernel function resolves a change id for every Rust command: digits that name a change, the full folder name, or the slug alone when TypeScript accepts it. Anything else fails with a message that names the input and the accepted forms.
- Every feature crate uses it and keeps no matcher of its own.
- Tests cover each accepted form and each refused form above, for every command that takes an id.

### Non-goals

- TypeScript's lookup.
