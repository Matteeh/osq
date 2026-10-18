# Spec Delta: cli-foundation

## ADDED Requirements

### Requirement: Rust guide for agents
AGENTS.md SHALL hold a hand-written `## Rust crates` section, outside every
managed block and before the project rules block, that tells an executor how
to work in `crates/`, and its Layout block SHALL list `crates/`. The section
SHALL name the governing ADRs, the layer order, the doc and tag rules, where
tests go, and the verify script to run.

#### Scenario: Rust guide names how to work in crates
- **WHEN** AGENTS.md's `## Rust crates` section is read
- **THEN** it contains every term below:

| Term |
|---|
| `ADRs 022 to 026` |
| `src/` |
| `apps`, then `features`, then `kernel`, then `core` |
| `Implements: <capability>/<requirement>` |
| `Covers: <capability>/<scenario>` |
| `#[cfg(test)]` |
| `[workspace.lints]` |
| `cargo fmt --all` |
| `sh scripts/verify-rust.sh` |

#### Scenario: Rust guide sits outside the managed blocks
- **WHEN** AGENTS.md is read
- **THEN** the `## Rust crates` heading comes before `<!-- OSQ:RULES:START -->`, the Layout code block holds a line starting `crates/`, `checkProjectRules` reports nothing, and `CLAUDE.md` is still a symlink to AGENTS.md
