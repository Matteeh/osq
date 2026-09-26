---
queue_item: opencode-v2-adapter
queue_hash: sha256:c4921cb96bd0d67b49fcb731b60a1c9d46a5e15d442048e478787d7492a8e458
planner: null
date: 2026-09-26
---

### Goal

osq knows whether its opencode adapter works with opencode v2, and either works with it or says clearly that it does not.

### Context

- The human upgraded to opencode v2, and this repository switched to the pi harness on 2026-09-26. `OSQ_HARNESS=opencode` still selects the opencode adapter, which was written and tested against opencode v1.

### Requirements

- Doctor's harness check reports whether the installed opencode version is inside the adapter's tested range.
- The adapter's argument list, event stream translation, and agent file setup work with opencode v2, or doctor fails with a message naming the unsupported version.

### Non-goals

- Changing this repository's default harness back.

### Notes for planning

- Record the opencode v2 CLI flags and stream format actually observed before planning tasks.
