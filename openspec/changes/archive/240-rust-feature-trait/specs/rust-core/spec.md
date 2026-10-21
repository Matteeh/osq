## ADDED Requirements

### Requirement: Feature trait
`osq-core` SHALL hold, in its `feature` module and with no IO, the object
safe `Feature` trait of ADR 028, which each feature crate implements once.
`name` gives the feature's name; `commands` lists `Command` values, each with
a `name`, `summary` and `usage`; `run` takes an `Invocation` of the project
`root`, the `command` and its string `args`, and returns an `Output` with the
`text` to print or a `FeatureError`.

#### Scenario: A hand-written feature runs its commands
- **WHEN** a test implements `Feature` as `echo`, offering `say` with usage `<words>...` and `fail` with an empty usage, and runs the invocation in the row
- **THEN** `run` returns the row's result:

| Command | Args | Result |
|---|---|---|
| `say` | `a`, `b` | output `a b` |
| `say` | none | `Usage` error displayed `usage of say: needs words` |
| `fail` | none | `Failed` error displayed `fail failed: it always fails` |
| `nope` | none | `UnknownCommand` error displayed `unknown command: nope` |

#### Scenario: Features register as a list
- **WHEN** the `echo` feature and a second test feature `count`, offering `count`, are held in that order as a `Vec<Box<dyn Feature>>`
- **THEN** their names read `echo`, `count`, the command names read `say`, `fail`, `count`, and the invocation `count` with args `x`, `y` sent to the first feature that lists `count` returns output `2`

### Requirement: Feature constructors
`Command`, `Invocation`, `Output`, `FeatureError` and each `FeatureError`
variant SHALL be `#[non_exhaustive]`, so a field or variant added later
touches no feature crate. Code outside `osq-core` SHALL build them through
`Command::new(name, summary, usage)`, `Invocation::new(root, command, args)`,
`Output::text(text)`, `FeatureError::unknown_command(name)`,
`FeatureError::usage(command, message)` and
`FeatureError::failed(command, message)`, and SHALL read their public fields.

#### Scenario: Constructors fill every field
- **WHEN** the constructor call in the row runs in a test outside `osq-core`
- **THEN** the value's public fields hold the row's values:

| Call | Fields |
|---|---|
| `Command::new("say", "Says words", "<words>...")` | `name` `say`, `summary` `Says words`, `usage` `<words>...` |
| `Invocation::new("/p", "say", ["a", "b"])` | `root` `/p`, `command` `say`, `args` `a`, `b` |
| `Output::text("a b")` | `text` `a b` |
| `FeatureError::unknown_command("nope")` | `UnknownCommand` with name `nope` |
| `FeatureError::usage("say", "needs words")` | `Usage` with `command` `say`, `message` `needs words` |
| `FeatureError::failed("fail", "it always fails")` | `Failed` with `command` `fail`, `message` `it always fails` |

### Requirement: Feature errors
A `FeatureError` SHALL be `UnknownCommand` with the command name, `Usage` with
the command and a message for arguments the feature cannot read, or `Failed`
with the command and a message for a command that failed after reading its
arguments. It SHALL implement `std::error::Error` and display as
`unknown command: <name>`, `usage of <command>: <message>` or
`<command> failed: <message>`.

#### Scenario: Feature error text
- **WHEN** the error in the row is displayed
- **THEN** it reads the row's text:

| Error | Text |
|---|---|
| `FeatureError::unknown_command("nope")` | `unknown command: nope` |
| `FeatureError::usage("say", "needs words")` | `usage of say: needs words` |
| `FeatureError::failed("fail", "it always fails")` | `fail failed: it always fails` |

## MODIFIED Requirements

### Requirement: Rust rebuild decisions
osq's decisions SHALL include the seven Rust rebuild ADRs 022 to 028, each
accepted, applying to the capability group `rust` through
`applies_to: [group:rust]`, so they govern every capability whose sidecar
names group `rust` and nothing under `src/`, naming `tests/rust-adrs.test.ts`
in its checks, and causing no decision problem. ADR 022 SHALL also name
`crates/core/tests/no_io.rs`, ADR 024 the linter kernel's link gate
tests, ADR 025 `crates/core/tests/event_corpus.rs`, and ADR 026 the specs
kernel's golden, validation, replay and parity tests and the linter
kernel's no-runtime-Node test. ADR 027, scheduling, SHALL also name core's
scheduler tests and the loop kernel's scope, schedule and corpus tests.
ADR 028, the Feature trait, SHALL also name core's feature test.
The index SHALL link each once, and AGENTS.md's project rules block SHALL
not change, since none applies to all.

#### Scenario: Rust ADRs are accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** each ADR below is listed and not ignored, with status `accepted`, `appliesTo` `["group:rust"]`, `governs` holding `rust-core`, and the checks of its row, `validateDecisions` reports no error and no warning, and `decisions/README.md` links its file exactly once:

| ADR | File | Checks |
|---|---|---|
| 022 | `022-rust-feature-crates.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/no_io.rs` |
| 023 | `023-rust-code-style.md` | `tests/rust-adrs.test.ts` |
| 024 | `024-rust-link-enforcement.md` | `tests/rust-adrs.test.ts`, `crates/kernel/linter/tests/link_gates.rs`, `crates/kernel/linter/tests/link_gates_corpus.rs` |
| 025 | `025-rust-on-disk-format.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/event_corpus.rs` |
| 026 | `026-openspec-in-rust.md` | `tests/rust-adrs.test.ts`, `crates/kernel/specs/tests/golden_corpus.rs`, `crates/kernel/specs/tests/validate_corpus.rs`, `crates/kernel/specs/tests/replay_corpus.rs`, `crates/kernel/specs/tests/openspec_validate_parity_corpus.rs`, `crates/kernel/specs/tests/openspec_archive_parity_corpus.rs`, `crates/kernel/linter/tests/node_spawn_corpus.rs` |
| 027 | `027-rust-scheduling.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/schedule.rs`, `crates/core/tests/schedule_props.rs`, `crates/kernel/loop/tests/scope_files.rs`, `crates/kernel/loop/tests/active_schedule.rs`, `crates/kernel/loop/tests/schedule_corpus.rs` |
| 028 | `028-rust-feature-trait.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/feature.rs` |

#### Scenario: Rules block without the Rust ADRs
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 022`, `ADR 023`, `ADR 024`, `ADR 025`, `ADR 026`, `ADR 027` or `ADR 028`, and `checkProjectRules` reports nothing

#### Scenario: Rust ADR check files exist
- **WHEN** every check file named by ADRs 022 to 028 is looked up from the repository root
- **THEN** each one exists
