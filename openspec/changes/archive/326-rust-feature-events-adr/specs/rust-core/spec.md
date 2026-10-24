## MODIFIED Requirements

### Requirement: Feature trait
`osq-core` SHALL hold, in its `feature` module and with no IO, the object
safe `Feature` trait of ADR 028, which each feature crate implements once.
`name` gives the feature's name; `commands` lists `Command` values, each with
a `name`, `summary` and `usage`; `run` takes an `Invocation` of the project
`root`, the `command` and its string `args`, and returns an `Output` with the
`text` to print or a `FeatureError`. As ADR 030 says, `reacts_to` lists the
`EventKind` values the feature reacts to, an empty list by default, and
`react` takes a `&Reaction<'_>` and returns an `Output` or a
`FeatureError`, by default `Output::text("")`.

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

#### Scenario: Reaction defaults
- **WHEN** a test feature implements only `name`, `commands` and `run`, and its `reacts_to` and its `react` with a `Reaction` of a `rejected` envelope are called
- **THEN** `reacts_to` is empty and `react` returns `Output::text("")`

### Requirement: Rust rebuild decisions
osq's decisions SHALL include the nine Rust rebuild ADRs 022 to 030, each
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
ADR 029, config, SHALL also name the config kernel's file and role tests.
ADR 030, feature events, SHALL also name core's reaction test, the loop
kernel's delivery test and the storage kernel's durable write test.
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
| 029 | `029-rust-config.md` | `tests/rust-adrs.test.ts`, `crates/kernel/config/tests/config_file.rs`, `crates/kernel/config/tests/roles.rs` |
| 030 | `030-rust-feature-events.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/feature_reactions.rs`, `crates/kernel/loop/tests/delivery.rs`, `crates/kernel/storage/tests/durable_write.rs` |

#### Scenario: Rules block without the Rust ADRs
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 022`, `ADR 023`, `ADR 024`, `ADR 025`, `ADR 026`, `ADR 027`, `ADR 028`, `ADR 029` or `ADR 030`, and `checkProjectRules` reports nothing

#### Scenario: Rust ADR check files exist
- **WHEN** every check file named by ADRs 022 to 030 is looked up from the repository root
- **THEN** each one exists

## ADDED Requirements

### Requirement: Event kinds
`osq-core` SHALL export `EventKind`, a `#[non_exhaustive]` enum deriving
`Clone`, `Copy`, `Debug`, `PartialEq`, `Eq` and `Hash`, with one unit
variant per `Event` variant, of the same name. `Event::kind(&self) ->
EventKind` SHALL give the variant's kind, and `EventKind::name(self) ->
&'static str` the `type` string that variant's event lines carry.

#### Scenario: Kinds of events
- **WHEN** a test reads `kind()` of the event in the row and `name()` of that kind
- **THEN** they are the row's:

| Event | Kind | Name |
|---|---|---|
| a `rejected` event | `EventKind::Rejected` | `rejected` |
| a `dead` event | `EventKind::Dead` | `dead` |
| a `recertification` event | `EventKind::Recertification` | `recertification` |
| a `verify_ran` event | `EventKind::VerifyRan` | `verify_ran` |

#### Scenario: Every kind names its type
- **WHEN** a test parses one valid line of each event type osq writes with `parse_event_line`, as the event round-trip tests build them
- **THEN** each event's `kind().name()` equals the line's `type`, and the kinds are all different

### Requirement: Reaction
`osq-core` SHALL export `Reaction<'a>`, a `#[non_exhaustive]` struct
deriving `Clone`, `Copy` and `Debug`, holding `root: &'a Path`, the project
root, `change: &'a Path`, the change folder, and `envelope: &'a Envelope`,
the event to react to. Code outside `osq-core` SHALL build it with
`Reaction::new(root, change, envelope)`.

#### Scenario: Reaction fields
- **WHEN** a test outside `osq-core` calls `Reaction::new` with the root `/p`, the change `/p/openspec/changes/001-a` and a `rejected` envelope
- **THEN** its `root`, `change` and `envelope` fields are those values
