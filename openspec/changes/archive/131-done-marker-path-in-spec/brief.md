---
queue_item: done-marker-path-in-spec
queue_hash: sha256:e46c77492843e6c2848b632dc9d1447cf2814fe818351b9e2fa61f68c8f176c3
planner: null
date: 2026-10-01
---

### Goal

The living watcher-and-harness spec names a task's done marker as `.run/done/<n>`, the path the watcher writes, everywhere it names one.

### Context

As of 2026-09-30:

- 118 (`stale-build-every-pass`) added the scenario "Source edited while a task runs" to "Stale build preflight detection" in `openspec/specs/watcher-and-harness/spec.md`. Its THEN says `` `.run/done/1.md` exists``.
- `writeDoneMarker` in `src/watcher/outcome.ts` writes `.run/done/<n>` with no extension. 118's executor flagged the mismatch and tested the real path: `tests/watcher-stale-every-pass.test.ts` checks `.run/done/1`.
- The mistake was the 118 planner's. No other living spec names a `.run/done/` file with an extension.

### Requirements

- The scenario "Source edited while a task runs" says `` `.run/done/1` exists``. Nothing else in the requirement changes.

### Non-goals

- Renaming the done marker.
- Changing any code or test.

### Notes for planning

- A MODIFIED "Stale build preflight detection" that repeats the requirement word for word and keeps every scenario, with only that path changed.
- The change adds no test and changes no code, so its one task's `verify` is `node --import tsx --test tests/watcher-stale-every-pass.test.ts` with `verify_starts: green`.
