---
queue_item: test-path-meanings
queue_hash: sha256:6be039f8c3aa553a8d014fd18608b312a37c9b204f97275e295c8ff16f0f9361
planner: null
date: 2026-09-29
---

### Goal

osq has two meanings of "test path", and the split is deliberate, but nothing says so and each meaning is copied by hand. Each meaning gets one named function, every consumer calls it, and the living spec says which meaning each consumer uses.

### Context

As of 2026-09-28:

- **The frozen-test gate's meaning** is `tests` or any path under `tests/`. The watcher's gate snapshots only that folder: `snapshotTestFiles` in `src/watcher/verify.ts` walks the private constant `TEST_DIR_NAME`. Three private copies of the same check follow it: `isTestFilePath` in `src/core/spec/linter.ts` (the `tests.modify` lint), `isTestPath` in `src/core/spec/test-impact.ts` (the frozen-test impact warning), and `isTestPath` in `src/core/spec/digest.ts` (the approval digest's `existingTests`). The comments on the first two say they mirror the `tests/**` default. The copy in `digest.ts` has no comment.
- **The traceability meaning** also counts any file whose name holds `.test.` or `.spec.`. `isTestPath` in `src/core/trace/test-path.ts` is the shared definition, used by traceability lint, the report's traceability gaps, and the system graph. `showIsTestPath` in `src/core/status/show.ts` is a private copy of it.
- The cli-foundation requirement "Test gating configuration" says the configuration loader defines test file patterns, defaulting to `tests/**`. No such configuration key exists. The gate is hardcoded.
- `src/core/spec/test-impact.ts` already imports from `src/core/run/`, so core code under `run/` can serve both spec lint and the watcher.

### Requirements

- One exported function and one exported folder constant define the frozen-test gate's meaning. The watcher's snapshot, the `tests.modify` lint, the impact lint's frozen-test warning, and the approval digest all use them. No private copy remains.
- `show.ts` uses `isTestPath` from `src/core/trace/test-path.ts`. No private copy remains.
- Output doesn't change: the digest, lint findings, `osq show`, the report and the graph print exactly what they print today.
- The living specs state both meanings, and which consumers use each one. The "Test gating configuration" requirement stops describing a configuration key that doesn't exist.

### Non-goals

- Changing either meaning, for example counting `.test.` files outside `tests/` as frozen.
- Making the gate's folder configurable.

### Notes for planning

- One refactor task with `verify_starts: green` should be enough. The delta carries the spec text.
- The delta will probably replace "Test gating configuration" with a REMOVED requirement and an ADDED one, because its scenario names `osq.config.ts` patterns that don't exist, and a MODIFIED requirement has to keep that scenario.
- `src/core/spec/linter.ts` is on the line-budget allow list and holds grandfathered functions. Check both budget tests if the edit shrinks one.
