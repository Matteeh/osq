//! Validation of living specs and delta specs (ADR 026).

pub mod change;
pub mod delta;
pub(crate) mod delta_entries;
pub(crate) mod delta_scan;
pub mod delta_targets;
pub mod finding;
pub mod living;
pub mod merged;
pub(crate) mod outline;
pub(crate) mod requirement;

pub use change::validate_change;
pub use delta::validate_delta;
pub use delta_targets::check_delta_targets;
pub use finding::{FindingCode, SpecFinding};
pub use living::{validate_living_spec, validate_living_specs};
pub use merged::validate_merged_change;

/// Sorts findings by line, keeping the table's order for findings on one line.
///
/// The callers push the findings of one line in the order of the "Validation
/// findings" table, and `sort_by_key` is stable, so a plain line sort keeps
/// that order.
pub(crate) fn sort_findings(findings: &mut [SpecFinding]) {
    findings.sort_by_key(|finding| finding.line);
}
