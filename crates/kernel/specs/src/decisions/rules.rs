//! The `AGENTS.md` project rules block that the system-wide ADRs expect.

use super::{Adr, AppliesTo, DecisionRecords};

/// The marker the project rules block opens with.
const RULES_START_MARKER: &str = "<!-- OSQ:RULES:START -->";
/// The marker the project rules block closes with.
const RULES_END_MARKER: &str = "<!-- OSQ:RULES:END -->";
/// The heading the project rules block holds after its start marker.
const RULES_HEADING: &str = "## Project rules\n\n";
/// The error TypeScript reports for a missing project rules block.
const MISSING_RULES: &str = "AGENTS.md is missing its project rules block; run `osq init`";
/// The error TypeScript reports when no system-wide ADR expects a block.
const UNEXPECTED_RULES: &str = "AGENTS.md has an unexpected project rules block; run `osq init`";
/// The error TypeScript reports for a block that differs from the expected one.
const STALE_RULES: &str = "AGENTS.md project rules block is out of date; run `osq init`";

/// The project rules errors: the block comparison and the system-wide count.
///
/// Implements: rust-specs/project-rules-block
#[must_use]
pub fn project_rules_errors(
    records: &DecisionRecords,
    agents: &str,
    max_project_rules: u64,
) -> Vec<String> {
    let system_wide = system_wide_adrs(records);
    let expected = expected_rules_block(&system_wide);
    let current = current_rules_block(agents);
    let mut errors = Vec::new();
    if current != expected {
        let message = match (current, expected) {
            (None, _) => MISSING_RULES,
            (Some(_), None) => UNEXPECTED_RULES,
            (Some(_), Some(_)) => STALE_RULES,
        };
        errors.push(message.to_owned());
    }
    let count = u64::try_from(system_wide.len()).unwrap_or(u64::MAX);
    if count > max_project_rules {
        errors.push(format!(
            "AGENTS.md holds {count} project rules, more than limits.maxProjectRules \
             ({max_project_rules})"
        ));
    }
    errors
}

/// The accepted ADRs whose `governs` is `all`, in ADR order.
fn system_wide_adrs(records: &DecisionRecords) -> Vec<&Adr> {
    records
        .adrs
        .iter()
        .filter(|adr| adr.status == "accepted" && adr.governs == AppliesTo::All)
        .collect()
}

/// The project rules block the system-wide ADRs expect, or none without one.
fn expected_rules_block(system_wide: &[&Adr]) -> Option<String> {
    if system_wide.is_empty() {
        return None;
    }
    let lines: Vec<String> = system_wide
        .iter()
        .map(|adr| format!("- {} ADR {}", adr.rule, adr.number))
        .collect();
    Some(format!(
        "{RULES_START_MARKER}\n{RULES_HEADING}{}\n{RULES_END_MARKER}",
        lines.join("\n")
    ))
}

/// The first ordered pair of rules markers in `agents`, or none.
fn current_rules_block(agents: &str) -> Option<String> {
    let start = agents.find(RULES_START_MARKER)?;
    let end = agents.find(RULES_END_MARKER)?;
    end.checked_sub(start)?;
    Some(agents[start..end + RULES_END_MARKER.len()].to_owned())
}
