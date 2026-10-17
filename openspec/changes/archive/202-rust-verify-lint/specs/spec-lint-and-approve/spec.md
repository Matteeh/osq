## MODIFIED Requirements

### Requirement: Verify-command trust validation
The linter SHALL analyze the proposal verify command and every task verify
command without executing or shell-expanding them. The template sentinel
`node -e "process.exit(0)"` and normalized equivalents SHALL be errors. A
recognized package-script invocation naming no script in the project-root
`package.json` SHALL be an error. Any other command that names neither an
existing repository-relative path, a recognized package script, a recognized
verify runner, nor a missing path the scope of its task or an earlier task
covers SHALL emit a warning.

Sentinel normalization SHALL cover surrounding and repeated ASCII whitespace,
single or double quotes around `process.exit(0)`, `-e` and `--eval`, and an
optional semicolon inside the JavaScript expression. Package-script recognition
SHALL cover ordinary pnpm, npm, yarn, and bun direct or `run` forms. A missing
or malformed package manifest SHALL be handled deterministically without
executing the command.

A command is a recognized verify runner when its first word is the binary of
one of the `verifyRunners` of the `languages` of `readLanguageMap` for the
project and its second word is one of that runner's subcommands. `lintChangeFolder`
SHALL read that language map once and use it for this check and for the
frozen-test gate.

#### Scenario: Placeholder verify is rejected
- **WHEN** a proposal or task verify is the template sentinel or a normalized equivalent
- **THEN** lint fails with an actionable diagnostic requiring real final-tree verification

#### Scenario: Referenced package script is missing
- **WHEN** a recognized package-manager command names a script absent from the root manifest
- **THEN** lint fails and identifies the missing script and artifact

#### Scenario: Verify target cannot be resolved
- **WHEN** a non-placeholder verify names no existing path, no recognized package script, and no path a task scope covers
- **THEN** lint emits an artifact-specific warning while preserving all independent lint errors

#### Scenario: Local verify target exists
- **WHEN** a verify names an existing repository file or directory or a present package script
- **THEN** trust validation emits no unresolved-target warning

#### Scenario: Verify names only its new test
- **WHEN** a task verify names only a test file that does not exist yet and the task's scope covers it
- **THEN** trust validation emits no unresolved-target warning

#### Scenario: Cargo verify
- **WHEN** a temporary project whose root holds the row's manifest lints a change whose task 1 verify is the row's command and whose scope is `src/lib.rs`
- **THEN** lint gives the row's unresolved-target warning, or none

| manifest | verify | warning |
| --- | --- | --- |
| `Cargo.toml` | `cargo test -p core --test parse` | none |
| `Cargo.toml` | `cargo nextest run` | none |
| `Cargo.toml` | `cargo build --release` | none |
| `Cargo.toml` | `cargo check` | none |
| `Cargo.toml` | `cargo clippy --all-targets` | none |
| `Cargo.toml` | `cargo fmt --check` | none |
| `Cargo.toml` | `cargo run --bin osq` | none |
| `Cargo.toml` | `cargo doc` | `Task in 1.md verify names neither an existing repository path nor a package script: "cargo doc"` |
| `package.json` | `cargo test` | `Task in 1.md verify names neither an existing repository path nor a package script: "cargo test"` |

### Requirement: Chained verify refusal
Lint SHALL refuse a task verify that chains commands with `&&`, `;`, or `|`.
When the project root holds a `package.json`, the error SHALL be
`Task in <n>.md verify chains commands ("<verify>"); move the chain into a
package script and name that script, for example pnpm run <script>`. When it
holds none, the error SHALL be `Task in <n>.md verify chains commands
("<verify>"); move the chain into a script file in the repository and name
that file, for example scripts/verify.sh`.

#### Scenario: Chained verify
- **WHEN** in a project whose root holds a `package.json`, task 1's verify is `pnpm a && pnpm b`
- **THEN** lint fails with the chained verify error and its package-script advice

#### Scenario: Chained verify without package.json
- **WHEN** in a project whose root holds a `Cargo.toml` and no `package.json`, task 1's verify is `cargo build && cargo test`
- **THEN** lint fails with `Task in 1.md verify chains commands ("cargo build && cargo test"); move the chain into a script file in the repository and name that file, for example scripts/verify.sh`
