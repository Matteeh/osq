---
queue_item: overlap-wait-survives-reapproval
queue_hash: sha256:e988fef81a3f4701ff6bcf93dc521e9aff30f1727e843257a3602b4fb20f85e9
planner: null
date: 2026-10-24
---

### Goal

When approve finds that a change rewrites capabilities an approved change also rewrites, it writes an overlap line to `.run/stacked-on`, and the change waits for that one to land. A re-approval of the awaited change silently drops that wait, so the two run independently, and whichever lands second finds its requirements changed on main.

### Context

As of 2026-10-24:

- `awaitedDependencies` in `src/core/spec/stack-dependencies.ts` keeps an overlap line only while its recorded hash equals the dependency's current approved hash (`if ((state.hash ?? '') !== line.hash) continue;`). After a steer and re-approval the hashes differ, and the line is ignored everywhere it is read: the watcher's start, sync (`sync-change.ts`), `osq show`'s runs-after and the land checks.
- What happened: 326 was re-approved at 12:04 and again at 13:52:04. 334 was approved at 13:52:14 and recorded `326 sha256:696c87… overlap rust-cli,rust-core`, the 12:04 hash. 334 then ran on main, landed at 15:32, and rewrote rust-cli "Command dispatch". 326, which rewrites the same requirement, regressed with `requirement_changed` and needed a steer.
- Approve also recorded a hash that was already stale ten seconds after the dependency's re-approval, so the recorded hash can lag even with no later steer.
- The Rust scheduler (ADR 027) and Rust approve may port the same rule.

### Requirements

- An overlap line whose dependency is still approved or archived but not landed keeps the change waiting, whatever hash the line records.
- A re-approval of the dependency is still visible: `osq show` and the inbox name the overlap and say the dependency was re-approved since, so a human can check that the overlap still holds.
- A dependency that is rejected or landed ends the wait, as today.
- A scenario test replays this sequence: B is approved with an overlap on A, A is steered and re-approved, and B does not start until A lands.
- If Rust already ports the hash check, the Rust code gets the same fix in its own crate.

### Non-goals

- Recomputing the overlap's capabilities after a re-approval.
- Declared `depends_on` entries, which never compare hashes.
