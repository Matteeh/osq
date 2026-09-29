---
queue_item: traceability-opt-in-once
queue_hash: sha256:3e5662dcc16dcd50f4ccd3933d52ee0266a55b2260044993d8ded9fcbcf92e6a
planner: null
date: 2026-09-29
---

### Goal

The check for whether a capability is opted into traceability is written once and shared, not copied into each file that needs it.

### Context

As of 2026-09-28:

- `isOptedIn` is copied word for word in `src/core/trace/mutation-pick.ts` and `src/core/run/focused-tests.ts`. `src/core/report/report-mutation.ts` has a third copy that takes the bare `capabilities` value.
- The related question "is anything opted in" is answered twice: by `hasOptedInCapability` in `src/watcher/mutation-check.ts`, and inline in `getMutationScores` in `report-mutation.ts`.
- `TraceabilityConfig` and its validator live in `src/core/foundation/config-traceability.ts`, owned by cli-foundation.
- Two readers expand `'all'` into a set of names, and they differ. `readOptedIn` in `src/core/spec/traceability-lint.ts` adds the change's delta capabilities, but `optedInCapabilities` in `src/core/report/report-traceability.ts` doesn't, because the report has no change.

### Requirements

- `config-traceability.ts` exports one function that answers "is this capability opted in", and one that answers "is anything opted in". The five places above use them, and no private copy remains.
- Behaviour doesn't change for `'all'`, for a list, or for the empty default.

### Non-goals

- Merging the two `'all'` expanders, which differ on purpose.
- Changing the traceability config's shape or its validation.

### Notes for planning

- The change writes no delta. It names `traceability` and `cli-foundation` in `features.reads`.
- One refactor task with `verify_starts: green`, plus a small test of the two exported functions over `'all'`, a list, and `[]`.
