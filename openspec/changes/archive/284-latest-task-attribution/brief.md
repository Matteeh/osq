---
queue_item: latest-task-attribution
queue_hash: sha256:5249fb575fce755b96ee54b5c5fae45642217570eeaff442705ce2326fb37f88
planner: null
date: 2026-10-22
---

### Goal

Today a done task's file changed by two or more later done tasks is attributed `ambiguous`. The owner then halts for a human `osq retry`, even when its own verify passes and the latest task's recorded completion hash equals the file (204-rust-core). To avoid that, plans keep every file to one owner plus one later task. That pushed 274-rust-show into constant placeholder sections that no later task could wire in, and task 2 died `blocked` ("Why 274 task 2 died (2026-10-22)" on Notion). Crediting the latest matching task lifts the limit, so later tasks can extend shared callers normally.

### Context

As of 2026-10-22:

- `attributeScopePaths` in `src/core/run/scope-hash.ts` picks candidates from typed `file_changed` events, else from `measures` end segments. More than one candidate gives `ambiguous`. One candidate whose completion hash contradicts the tree (`contradicted`) gives `unknown`. It is called from `src/watcher/regression.ts`.
- watcher-and-harness "Scope recertification audit" says "Multiple qualifying tasks SHALL be `ambiguous`". Its scenario "Two later tasks measured the path" pins `ambiguous`. "Automatic scope recertification" decides when an attributed owner recertifies by itself.
- Tests that pin attribution include `tests/scope-recertification.test.ts` and `tests/scope-credit.test.ts`.

### Requirements

- With several later candidates for a path, from either source, the path is credited to the highest-numbered candidate whose recorded completion hash for the path equals the current file hash. The credited entry keeps the source rule it has today (`source: "measures"` only when credited from measures).
- When no candidate records a matching hash, the result stays `ambiguous`. A single candidate keeps today's rules.
- An owner whose every differing path is credited this way recertifies automatically, as with one later task, when its verify passes.
- "Two later tasks measured the path" becomes two cases: both tasks record completion hashes and the later one matches the tree (credited to task 3), and neither records a hash (`ambiguous`).

### Non-goals

- Changing how `file_changed` events or `measures` segments are recorded.
- A lint warning for files claimed by three or more tasks; this change makes that unnecessary.
- The Rust scope audit (`audit_scope` in core), which does not attribute recertification yet.
