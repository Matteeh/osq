## ADDED Requirements

### Requirement: Test gate paths
`src/core/run/test-gate.ts` SHALL export `TEST_GATE_DIR`, `tests`, and
`isGatedTestPath`, true for `tests` and paths under `tests/`. These are the
paths the frozen-test gate governs; unlike traceability's "Test paths", a
`.test.` file outside `tests/` is not one. The runner's test snapshot, the git
guard and task commit's new test files, and spec lint's gate checks SHALL use
them and define none of their own.

#### Scenario: Gated and ungated paths
- **WHEN** `isGatedTestPath` is called with `tests`, `tests/a.test.ts`, `tests/sub/b.ts`, `src/a.test.ts`, `testsuite/a.ts`, and `src/tests/a.ts`
- **THEN** it returns true, true, true, false, false, and false

#### Scenario: One gate definition
- **WHEN** the sources of `src/watcher/verify.ts`, `src/watcher/git-guard.ts`, `src/core/run/task-commit.ts`, `src/core/spec/linter.ts`, `src/core/spec/test-impact.ts`, and `src/core/spec/digest.ts` are read
- **THEN** none compares a path with `'tests'` or `'tests/'` itself, and each imports from `src/core/run/test-gate.ts`
