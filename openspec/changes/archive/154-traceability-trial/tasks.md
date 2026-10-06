# Tasks

## 1. Opt in and record the trial

- [x] 1. When osq's own config loads, traceability is opted in for the traceability capability in warn mode, with focused tests and StrykerJS mutation checks that need no build
- [x] 2. When osq's decisions are read, ADR 011 records what the traceability trial measures and what decides block, widen, or drop, and when

## 2. Link traceability's scenarios

- [x] 3. When the effective scenario lookup scenarios run, they go through the scenario helper, and lookupScenario and worktreeChangeFolder carry their tags
- [x] 4. When the scanner, index, test path, ownership, and entry point scenarios run, they go through the scenario helper, and scanSource, buildScenarioIndex, and isTestPath carry their tags
- [x] 5. When the function range, baseline, and pick scenarios run, they go through the scenario helper, and the range functions and pickMutations carry their tags
- [x] 6. When the scenario helper's own scenarios run, they go through the helper, and scenario carries their tags
