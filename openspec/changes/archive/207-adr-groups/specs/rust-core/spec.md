# Spec Delta: rust-core

## MODIFIED Requirements

### Requirement: Rust rebuild decisions
osq's decisions SHALL include the five Rust rebuild ADRs 022 to 026, each
accepted, applying to the capability group `rust` through
`applies_to: [group:rust]`, so they govern every capability whose sidecar
names group `rust` and nothing under `src/`, naming `tests/rust-adrs.test.ts`
in its checks, and causing no decision problem. ADR 022 SHALL also name
`crates/core/tests/no_io.rs` and ADR 025 `crates/core/tests/event_corpus.rs`.
The index SHALL link each once, and AGENTS.md's project rules block SHALL not
change, since none applies to all.

#### Scenario: Rust ADRs are accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** each ADR below is listed and not ignored, with status `accepted`, `appliesTo` `["group:rust"]`, `governs` holding `rust-core`, and the checks of its row, `validateDecisions` reports no error and no warning, and `decisions/README.md` links its file exactly once:

| ADR | File | Checks |
|---|---|---|
| 022 | `022-rust-feature-crates.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/no_io.rs` |
| 023 | `023-rust-code-style.md` | `tests/rust-adrs.test.ts` |
| 024 | `024-rust-link-enforcement.md` | `tests/rust-adrs.test.ts` |
| 025 | `025-rust-on-disk-format.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/event_corpus.rs` |
| 026 | `026-openspec-in-rust.md` | `tests/rust-adrs.test.ts` |

#### Scenario: Rules block without the Rust ADRs
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 022`, `ADR 023`, `ADR 024`, `ADR 025` or `ADR 026`, and `checkProjectRules` reports nothing

#### Scenario: Rust ADR check files exist
- **WHEN** every check file named by ADRs 022 to 026 is looked up from the repository root
- **THEN** each one exists
