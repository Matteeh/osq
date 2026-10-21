## MODIFIED Requirements

### Requirement: Rust rebuild decisions
osq's decisions SHALL include the eight Rust rebuild ADRs 022 to 029, each
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

#### Scenario: Rules block without the Rust ADRs
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 022`, `ADR 023`, `ADR 024`, `ADR 025`, `ADR 026`, `ADR 027`, `ADR 028` or `ADR 029`, and `checkProjectRules` reports nothing

#### Scenario: Rust ADR check files exist
- **WHEN** every check file named by ADRs 022 to 029 is looked up from the repository root
- **THEN** each one exists
