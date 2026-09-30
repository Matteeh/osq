---
queue_item: regressed-report-short
queue_hash: sha256:301a2675302e18a6b5959d5cd33671723868e9a08252e45f77d1ca30139c4e05
planner: null
date: 2026-09-30
---

### Goal

`.run/regressed/<target>.md` holds what a human or planner needs to see why archive verification failed: the failing tests and the end of the output. The full log stays in the `verify_ran` event.

### Context

- 113's `.run/regressed/change.md` on 2026-09-29 was 306 KB: the whole `pnpm verify` output, built by `verifyArchiveStep` in `src/watcher/archive-verify.ts` from the `verify_ran` event's `output`.
- The one failure was in `tests/living-specs-delta-equivalence.test.ts`. Its `assert.equal` of two whole living specs printed both, about 8 KB each, so even a grep for the failure pulled in 16 KB of spec text.
- `node --test` ends its output with a `✖ failing tests:` section that repeats every failure.

### Requirements

- The report body keeps the `✖ failing tests:` section to the end of the output when the output has one. Otherwise it keeps the last lines of the output, a count from config.
- Any single line in the body is cut to a length from config, ending in `… (<n> more characters)`.
- The report says where the full output is: the `verify_ran` event in `.run/events/<target>.jsonl`.
- The same applies to every other writer of a verify log into a `.run/` marker, if any exists; the planner finds them.
- `tests/living-specs-delta-equivalence.test.ts` reports a mismatch as the first differing lines with a few lines of context, not two whole specs.

### Non-goals

- Changing the `verify_ran` event or its `output`.
- Summarizing output with a model.

### Notes for planning

- New config keys go under `DEFAULT_CONFIG` like every limit.
- `osq show` and the dashboard read the regressed body; check what they pin.
