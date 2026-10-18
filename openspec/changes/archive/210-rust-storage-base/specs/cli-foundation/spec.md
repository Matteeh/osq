# Spec Delta: cli-foundation

## MODIFIED Requirements

### Requirement: Rust guide for agents
AGENTS.md SHALL hold a hand-written `## Rust crates` section, outside every
managed block and before the project rules block, and its Layout block SHALL
list `crates/`. The section SHALL name the governing ADRs, the layer order,
the doc and tag rules, where tests go, the verify script, that verify fails
on a missed mutant in the changed lines and how to check a file by hand, and
how to write a corpus test.

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
| `OSQ_DIFF` |
| `missed mutant` |
| `cargo mutants -p <package> -f <file>` |
| `tests/<name>_corpus.rs` |
| `#[ignore = "corpus test: <reason>"]` |

#### Scenario: Rust guide sits outside the managed blocks
- **WHEN** AGENTS.md is read
- **THEN** the `## Rust crates` heading comes before `<!-- OSQ:RULES:START -->`, the Layout code block holds a line starting `crates/`, `checkProjectRules` reports nothing, and `CLAUDE.md` is still a symlink to AGENTS.md
