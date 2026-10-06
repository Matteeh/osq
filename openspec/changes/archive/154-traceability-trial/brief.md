---
queue_item: traceability-trial
queue_hash: sha256:af14fe51a44ea059aa441ea088f4d60460041df5bd83bc3963b9ed31c1952241
planner: null
date: 2026-10-06
---

### Goal

osq opts one of its own capabilities into traceability in warn mode, links its scenarios to tests and code, and measures whether the links and mutation checks earn a place: as a default gate, and as evidence for the validator.

### Context

As of 2026-10-05:

- The ROADMAP calls this "the biggest gap between self-documenting and true". `DEFAULT_TRACEABILITY_CONFIG` (`src/core/foundation/config-traceability.ts`) has `capabilities: []` and `mode: 'warn'`, and `osq.config.ts` has no `traceability` block.
- Opt-in drives focused tests (`src/core/run/focused-tests.ts`), mutation picks (`src/core/trace/mutation-pick.ts`), `osq report`'s mutation section (`report-mutation.ts`), and traceability lint (`src/core/spec/traceability-lint.ts`). Mutation checks only observe (`src/watcher/mutation-check.ts`).
- Tags are `@scenario <capability>: <name>` lines in a doc comment directly above an exported function (living requirement traceability "Traceability tags"). Only 8 test files use `@scenario`, all of them traceability's own tests.
- Capability sizes: traceability 13 requirements and 36 scenarios; version-control 16 and 91; web-inspection 28 and 83; the rest are larger.
- 149 adds an observe-only validator (ADR 010), due for a block-or-drop decision after 15 validated changes or on 2026-11-15, whichever comes first. It reads the repository and the changed scenarios. It does not read traceability results, so linked scenarios are evidence a later validator step could use.

### Requirements

- `osq.config.ts` opts one capability into traceability in warn mode.
- That capability's scenarios are linked: its exported functions carry `@scenario` tags, and its scenarios have tests through the scenario helper. Any scenario left unlinked is listed with the reason.
- `osq report` shows the capability's link coverage and mutation results.
- The proposal records what was measured: scenarios linked, unreadable tags, mutants that survived, and time added per task. It also says which ADR records what decides between block, widen and drop, and when, as ADR 006 decision 4 asks of any warning.

### Non-goals

- `require` mode, or opting in every capability.
- Changing traceability's code. A bug found on the way goes in `## Outside scope`.

### Notes for planning

- Choose the capability by measuring: traceability is smallest, and version-control owns the git code where 149's bug lived. Say why in the proposal.
- New test files are always allowed. Link scenarios with new scenario test files rather than editing existing tests, unless the fallout measurement shows that is cheaper.
- Adding tags to `src/` functions is a source change; scope it by folder, and watch the line and function budgets.
