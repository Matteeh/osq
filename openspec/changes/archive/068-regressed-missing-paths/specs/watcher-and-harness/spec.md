# Spec Delta: Watcher and Harness

## MODIFIED Requirements

### Requirement: Archive-time verification re-run
<!-- source: src/watcher/archiver.ts, src/watcher/archive-verify.ts, src/watcher/verify.ts, src/harness/types.ts, tests/archive-verification.test.ts, tests/plan-prompt-lifecycle.test.ts, tests/archive-verify-path-missing.test.ts, tests/regressed-missing-paths.test.ts -->
Before archiving, the watcher SHALL re-run every task and change-level
verification against the final tree after scope recertification. A command
naming a missing path SHALL NOT run; its regression SHALL carry reason
`verify_path_missing` and the paths as `missingPaths`. When all gates pass, it
SHALL delete root-level `plan-prompt.md`, apply deltas, relocate the folder,
project completed checkboxes, and record the archive event. The transient prompt
SHALL not affect any archive tree hash.

#### Scenario: Archive verification passes and seals change
- **WHEN** every task verification and the change-level verify command pass against the final tree
- **THEN** the archiver removes the transient prompt, applies deltas, and relocates the change to the archive

#### Scenario: Task verification regression blocks archive
- **WHEN** any task verification command fails during archive preflight
- **THEN** the watcher records the established task regression and leaves the change and prompt unarchived

#### Scenario: Change-level verification regression blocks archive
- **WHEN** the change-level verify command fails during archive preflight
- **THEN** the watcher records the established change regression and leaves the change and prompt unarchived

#### Scenario: Archive succeeds with a prompt file
- **WHEN** every final-tree verification passes and `plan-prompt.md` exists
- **THEN** the archived change omits the prompt while retaining authored artifacts and runtime records

#### Scenario: Archive verification fails
- **WHEN** a task or change-level final verification fails
- **THEN** the active change and its prompt remain available for diagnosis and no archive event is written

#### Scenario: Named path missing at archive
- **WHEN** a done task's verify names a file that no longer exists
- **THEN** that task gets a regressed marker with reason `verify_path_missing` listing the path, its `regressed` event carries `missingPaths` with the path and no `differingPaths`, the command does not run, and the change stays unarchived
