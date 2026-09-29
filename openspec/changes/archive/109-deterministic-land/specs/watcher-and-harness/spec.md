## MODIFIED Requirements

### Requirement: Archive-time verification re-run
<!-- source: src/watcher/archiver.ts, src/watcher/archive-specs.ts, src/watcher/archive-verify.ts, src/watcher/verify.ts, src/watcher/loop.ts, src/harness/types.ts, tests/archive-verification.test.ts, tests/archive-specs-verify.test.ts, tests/plan-prompt-lifecycle.test.ts, tests/archive-verify-path-missing.test.ts, tests/regressed-missing-paths.test.ts -->
Before archiving, the watcher SHALL re-run every task verification against the
final tree after scope recertification. It SHALL then apply the change's
deltas and sidecars to the living specs and re-run the change-level
verification against that tree, so the tree it archives is a verified tree.
Before applying, it SHALL write `.run/archive-specs.json`, recording for each
capability folder under the change's `specs/` the content of the living
`spec.md` and `osq.yml`, or that the file is absent. When the change-level
verification fails or names a missing path, it SHALL put each recorded file
back as it was, removing one that was absent and a capability folder left
empty, delete the record, and leave the change unarchived with the established
change regression in `.run/regressed/change.md`. When the record exists as an
archive attempt begins, because the watcher stopped after applying, it SHALL
first put the files back the same way; the watcher's archive step SHALL do
this before it checks the change's worktree. A command naming a missing path
SHALL NOT run; its regression SHALL carry reason `verify_path_missing` and the
paths as `missingPaths`. When all gates pass, it SHALL delete the record and
root-level `plan-prompt.md`, relocate the folder, project completed
checkboxes, and record the archive event. The transient prompt and the record
SHALL not affect any archive tree hash. `archiveSpecFolder` SHALL keep applying
the deltas and sidecars itself for callers that archive without these gates.

#### Scenario: Archive verification passes and seals change
- **WHEN** every task verification passes against the final tree and the change-level verify command passes against it with the deltas applied
- **THEN** the archiver removes the transient prompt and relocates the change to the archive, and the living specs hold the deltas

#### Scenario: Task verification regression blocks archive
- **WHEN** any task verification command fails during archive preflight
- **THEN** the watcher records the established task regression, applies no delta, and leaves the change and prompt unarchived

#### Scenario: Change-level verification regression blocks archive
- **WHEN** the change-level verify command fails against the tree with the deltas applied
- **THEN** the watcher records the established change regression, the living specs are what they were before archive began, and the change and prompt stay unarchived

#### Scenario: Archive succeeds with a prompt file
- **WHEN** every final-tree verification passes and `plan-prompt.md` exists
- **THEN** the archived change omits the prompt and `.run/archive-specs.json` while retaining authored artifacts and runtime records

#### Scenario: Archive verification fails
- **WHEN** a task or change-level final verification fails
- **THEN** the active change and its prompt remain available for diagnosis and no archive event is written

#### Scenario: Named path missing at archive
- **WHEN** a done task's verify names a file that no longer exists
- **THEN** that task gets a regressed marker with reason `verify_path_missing` listing the path, its `regressed` event carries `missingPaths` with the path and no `differingPaths`, the command does not run, and the change stays unarchived

#### Scenario: Change verify sees the merged specs
- **WHEN** the change-level verify exits 0 only when the living spec holds the requirement the change's delta adds
- **THEN** the change archives

#### Scenario: Red change verify puts the specs back
- **WHEN** a change modifies one requirement of `orders`, removes another, carries a replacement `osq.yml` for it, creates `billing` with a group, and its change-level verify exits 1
- **THEN** `orders`'s `spec.md` and `osq.yml` are byte for byte what they were, `openspec/specs/billing` does not exist, `.run/archive-specs.json` is gone, and `.run/regressed/change.md` has reason `verify_red`

#### Scenario: Interrupted archive
- **WHEN** `.run/archive-specs.json` exists and the living specs already hold the change's deltas, as after the watcher stopped during the change-level verify
- **THEN** the next archive attempt puts the recorded files back, applies the deltas once, and archives with the removed requirement absent

#### Scenario: Interrupted archive in a worktree
- **WHEN** a change runs in an osq worktree and the worktree holds `.run/archive-specs.json` and living specs modified by an interrupted archive
- **THEN** the next watcher cycle archives the change instead of halting it with `worktree_dirty`
