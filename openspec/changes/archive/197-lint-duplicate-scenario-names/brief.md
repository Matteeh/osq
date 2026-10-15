---
queue_item: lint-duplicate-scenario-names
queue_hash: sha256:9437bd3edd0303114c4586d9e7dcfcd742d4071df9e0b7dffdb13f6546721883
planner: null
date: 2026-10-15
---

### Goal

`osq lint` reports an error when a change's delta would leave a capability with two scenarios of the same name that it didn't have before. Today the planner finds out only when the baseline goes red at the first task, because `scenario()` lookups throw on duplicate names.

### Context

As of 2026-10-14:

- 191's delta added a web-inspection scenario named "Phone width" under a new requirement; "Approve review view" already had one. `osq lint 191` passed. At the first task the watcher's baseline `pnpm verify` failed, because five `scenario('web-inspection', …)` tests threw `The web-inspection spec has two scenarios named "Phone width"` (`lookupScenario` in `src/core/trace/scenario-lookup.ts`, which merges the change's delta). 191 had to be rejected and replanned as 192.
- Five living specs already hold duplicate scenario names: cli-foundation 8, watcher-and-harness 5, spec-lint-and-approve 2, metrics-and-reporting 1, status-inspection 1. Lint must not fail every change that touches them.
- A MODIFIED requirement repeats its own scenarios by name; that is not a duplicate.
- Lint already merges deltas for other checks; `src/core/spec/delta.ts` refuses duplicate requirement names within one section.

### Requirements

- After merging the change's deltas into each capability it writes, lint reports an error for every scenario name that appears in more than one requirement and did not already appear in more than one requirement in the living spec. The error names the capability, the scenario and both requirements.
- Names that were already duplicated in the living spec stay allowed.
- A scenario that a MODIFIED requirement keeps under its own name is never reported.
- The approve gate refuses the same change, since approve runs lint.

### Non-goals

- Renaming the existing duplicates. They can go through generated changes later.
- Checking scenario names across capabilities.

### Notes for planning

- Reuse the merge that `lookupScenario` uses, so lint and the test helper can't disagree about what counts as a duplicate.
