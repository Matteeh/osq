//! The validation refusal `approve` prints when a change's delta specs fail.

use osq_kernel_specs::{MergeChangeError, SpecFinding};

/// The refusal for a change whose delta specs give `findings`.
///
/// Implements: rust-approve/approve-validation
pub(crate) fn findings(folder: &str, findings: &[SpecFinding]) -> String {
    let lines: Vec<String> = findings
        .iter()
        .map(|finding| format!("  - {}:{}: {}", finding.file, finding.line, finding.message))
        .collect();
    format!("Lint failed for spec \"{folder}\":\n{}", lines.join("\n"))
}

/// The refusal for a change whose merged validation gave `error`.
///
/// Implements: rust-approve/approve-validation
pub(crate) fn merge(folder: &str, error: &MergeChangeError) -> String {
    format!("Lint failed for spec \"{folder}\":\n  - {error}")
}
