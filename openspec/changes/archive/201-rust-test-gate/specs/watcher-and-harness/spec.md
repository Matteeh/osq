## MODIFIED Requirements

### Requirement: Test modification gating
Before agent execution, the runner SHALL read the project's language map with
`readLanguageMap`, snapshot every preexisting file under `tests/**` and under
each of the map's `testFolders`, and snapshot the test-module lines of every
other path in the map's `paths` whose language's adapter has
`testModuleRanges` and finds at least one range in it. It SHALL resolve the
task's scope against that pre-spawn tree. A test file is changed when its
content changed, and a source file's test modules are changed when the lines
inside its test-module ranges before the task, in file order, are no longer a
subsequence of the lines inside its ranges after the task; adding lines is no
change. A changed or deleted preexisting test file, and a source file whose
test modules changed or that was deleted, SHALL be authorized only when the
task declares `tests.modify: true` and that resolved scope contains the file.

Every unauthorized diagnostic SHALL be sorted by project-relative POSIX path
and name the file's state, `modified`, `deleted` or `test module modified`,
plus the literal file scope entry that would authorize it, as
`<path> (<state>); authorizing scope: <path>`.

#### Scenario: Test modification with tests.modify true
- **WHEN** agent changes or deletes a preexisting test file, `tests.modify: true`, and pre-spawn scope resolution contains that file
- **THEN** runner permits that file and proceeds to independent zero-trust verification

#### Scenario: Test modification outside declared scope
- **WHEN** agent changes or deletes a preexisting test file that pre-spawn scope resolution does not contain
- **THEN** runner writes `.run/dead/<n>.md` with `reason: undeclared_test_change`, names the required literal scope entry, emits a `dead` event, and halts without running verification

#### Scenario: Test modification without tests.modify declaration
- **WHEN** agent modifies or deletes a preexisting test file and task omitted `tests.modify: true`
- **THEN** runner writes `.run/dead/<n>.md` with `reason: undeclared_test_change`, emits a `dead` event, and halts without running verification

#### Scenario: Brand new test file creation
- **WHEN** agent creates a new test file that was absent from the pre-spawn snapshot
- **THEN** runner permits the addition without requiring `tests.modify: true`

#### Scenario: Rust tests in a Cargo workspace
- **WHEN** a temporary git project tracks a root `Cargo.toml` workspace, `crates/core/Cargo.toml`, `crates/core/src/lib.rs` whose `#[cfg(test)] mod tests` holds `assert_eq!(add(1, 2), 3);`, `crates/core/tests/api.rs`, `crates/core/benches/speed.rs`, `crates/cli/Cargo.toml`, `crates/cli/src/main.rs` with a `#[cfg(test)] mod tests`, `crates/cli/tests/run.rs` and `crates/cli/tests/data/input.txt`, and the runner runs a task with the row's scope and `tests.modify` whose agent makes the row's change
- **THEN** the task ends as the row says: dead with `reason: undeclared_test_change` and the marker line `- <diagnostic>`, or done

| agent change | scope | tests.modify | outcome |
| --- | --- | --- | --- |
| appends a line to `crates/core/tests/api.rs` | (none) | false | dead, `crates/core/tests/api.rs (modified); authorizing scope: crates/core/tests/api.rs` |
| deletes `crates/cli/tests/run.rs` | (none) | false | dead, `crates/cli/tests/run.rs (deleted); authorizing scope: crates/cli/tests/run.rs` |
| appends a line to `crates/core/benches/speed.rs` | (none) | false | dead, `crates/core/benches/speed.rs (modified); authorizing scope: crates/core/benches/speed.rs` |
| appends a line to `crates/cli/tests/data/input.txt` | (none) | false | dead, `crates/cli/tests/data/input.txt (modified); authorizing scope: crates/cli/tests/data/input.txt` |
| changes `assert_eq!(add(1, 2), 3);` to `assert_eq!(add(1, 2), 4);` in `crates/core/src/lib.rs` | `crates/core/src/lib.rs` | false | dead, `crates/core/src/lib.rs (test module modified); authorizing scope: crates/core/src/lib.rs` |
| removes the `#[cfg(test)]` line of `crates/core/src/lib.rs` | `crates/core/src/lib.rs` | false | dead, `crates/core/src/lib.rs (test module modified); authorizing scope: crates/core/src/lib.rs` |
| deletes `crates/cli/src/main.rs` | `crates/cli/src/main.rs` | false | dead, `crates/cli/src/main.rs (deleted); authorizing scope: crates/cli/src/main.rs` |
| adds a `#[test] fn more() {}` inside the test module of `crates/core/src/lib.rs` | `crates/core/src/lib.rs` | false | done |
| changes `a + b` to `b + a` outside the test module of `crates/core/src/lib.rs` | `crates/core/src/lib.rs` | false | done |
| changes `assert_eq!(add(1, 2), 3);` to `assert_eq!(add(1, 2), 4);` in `crates/core/src/lib.rs` | `crates/core/src/lib.rs` | true | done |
| appends a line to `crates/core/tests/api.rs` | `crates/core/tests/api.rs` | true | done |
| creates `crates/core/tests/new.rs` | (none) | false | done |

### Requirement: Test gate paths
`src/core/run/test-gate.ts` SHALL export `TEST_GATE_DIR`, `tests`, and
`isGatedTestPath`, true for `tests` and paths under `tests/`. It SHALL also
export `gatedTestPathFilter(map)`, which returns a predicate true for every
path `isGatedTestPath` accepts and for each of the language map's
`testFolders` and paths under one. These are the paths the frozen-test gate
governs; unlike traceability's "Test paths", a `.test.` file outside them is
not one. The runner's test snapshot in `src/core/run/test-snapshot.ts`, the
git guard and task commit's new test files, and spec lint's gate checks SHALL
use them and define none of their own.

#### Scenario: Gated and ungated paths
- **WHEN** `isGatedTestPath` is called with `tests`, `tests/a.test.ts`, `tests/sub/b.ts`, `src/a.test.ts`, `testsuite/a.ts`, and `src/tests/a.ts`
- **THEN** it returns true, true, true, false, false, and false

#### Scenario: One gate definition
- **WHEN** the sources of `src/core/run/test-snapshot.ts`, `src/watcher/git-guard.ts`, `src/core/run/task-commit.ts`, `src/core/spec/linter.ts`, `src/core/spec/test-impact.ts`, and `src/core/spec/digest.ts` are read
- **THEN** none compares a path with `'tests'` or `'tests/'` itself, and each imports `isGatedTestPath`, `TEST_GATE_DIR` or `gatedTestPathFilter` from `src/core/run/test-gate.ts`

#### Scenario: Crate test folders are gated
- **WHEN** `gatedTestPathFilter` is built from the map of `Cargo.toml`, `crates/core/Cargo.toml` and `package.json`, and called with the path in the row
- **THEN** it returns the row's answer

| path | gated |
| --- | --- |
| `tests/a.test.ts` | true |
| `crates/core/tests` | true |
| `crates/core/tests/api.rs` | true |
| `crates/core/tests/data/input.txt` | true |
| `crates/core/benches/speed.rs` | true |
| `benches/root.rs` | true |
| `crates/core/src/lib.rs` | false |
| `crates/core/testsuite/a.rs` | false |
| `src/tests/a.ts` | false |
