## MODIFIED Requirements

### Requirement: Feature registry
`features()` in `osq-cli` SHALL return one `Box<dyn Feature>` for every
feature crate that implements `Feature`, in this order: `PlanFeature`,
`ApproveFeature`, `RunFeature`, `ArchiveFeature`, `LandFeature`,
`InboxFeature`, `ReportFeature`, `ShowFeature`, `LintFeature`,
`DoctorFeature`, `RetryFeature` and `ManualFeature`, each built with
`new()` where its crate offers one. The registry is the one list of
features; help and dispatch read only it; a crate with no `Feature` is not
in it.

#### Scenario: Registered features
- **WHEN** a test reads `features()`
- **THEN** their names are `plan`, `approve`, `run`, `archive`, `land`, `inbox`, `report`, `show`, `lint`, `doctor`, `retry` and `manual`, in that order

#### Scenario: Run through the registry
- **WHEN** `run_cli` runs with `features()`, a new empty folder under `CARGO_TARGET_TMPDIR` as the root, and the row's arguments
- **THEN** it returns an empty stdout, the row's stderr with `<root>` standing for the root, and code 1, and the root is still empty:

| Arguments | Stderr |
|---|---|
| `run`, `1` | `usage of run: expected <id> <task>\n` |
| `run`, `1`, `1` | `run failed: Spec "1" not found in <root>/openspec/changes\n` |

## ADDED Requirements

### Requirement: Manual through the CLI
`run_cli` with `features()` SHALL run `manual` through the registry, so a
kept edit prints on stdout with code 0 and a refusal prints `manual failed:
<message>` on stderr with code 1.

#### Scenario: Manual through the CLI
- **WHEN** a scratch folder under `std::env::temp_dir()` holds `osq.toml` with `[vcs]`, `enabled = true` and `author = "osq <osq@example.com>"`, and `a.txt` (`one\n`), all committed by `git init -b main` with the local config `user.name Ada`, `user.email ada@example.com` and `commit.gpgsign false`, then `a.txt` becomes `two\n`, and `run_cli` runs with `features()`, the folder as the root, and the row's arguments in order
- **THEN** it returns the row's stdout, stderr and code, with `<commit>` standing for the first 7 characters of `git rev-parse HEAD` after the run:

| Arguments | Stdout | Stderr | Code |
|---|---|---|---|
| `manual`, `   ` | empty | `manual failed: osq manual needs a comment: osq manual "<why>"\n` | 1 |
| `manual`, `keep a` | `Kept a.txt as <commit>\n` | empty | 0 |
| `manual`, `again` | empty | `manual failed: nothing to keep: the checkout has no uncommitted edits outside openspec/changes\n` | 1 |
