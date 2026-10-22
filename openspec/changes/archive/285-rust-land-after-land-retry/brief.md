---
queue_item: rust-land-after-land-retry
queue_hash: sha256:4c3c905a1f64b65860fabad04756f47acbada3d609b3ac6ac4a995a4f4aefe10
planner: null
date: 2026-10-22
---

### Goal

The inbox's after-land card tells the human to run `osq land <id>` again. In TypeScript that reruns the failed after-land command; in Rust a second land of a landed change only refuses, so the card's advice does nothing.

### Context

As of 2026-10-22:

- TypeScript reruns it in `retryAfterLand` in `src/core/vcs/land-after.ts`, when `readAfterLandFailure` finds a failure record that names the change. A pass clears the record. A failure rewrites it with the new output.
- 279 runs the command after a land in `crates/features/land` and writes the failure record. 280 makes the Rust inbox read the record.

### Requirements

- `osq land <id>` in Rust, on a landed change whose after-land failure record names it, reruns the configured command in the checkout. It clears the record on a pass and rewrites it on a failure, with TypeScript's text and exit code.
- Without a record, a landed change is refused as today.
- Tests use scratch repositories and commands that pass and fail.

### Non-goals

- Moving the 20-line output tail into config.
