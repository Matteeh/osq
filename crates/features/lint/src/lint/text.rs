//! The text `lint` prints: one line per finding and the count line above them.

use std::path::Path;

use osq_core::Finding;
use osq_kernel_specs::{MergeError, SpecFinding};

/// The refusal for a query that names no active change.
///
/// Implements: rust-lint/lint-lookup
pub(crate) fn not_found(query: &str, changes: &Path) -> String {
    format!("Spec \"{query}\" not found in {}", changes.display())
}

/// The output for a change with no finding.
///
/// Implements: rust-lint/lint-findings
pub(crate) fn valid(folder: &str) -> String {
    format!("{folder}: valid\n")
}

/// The failure message for a change with `findings`.
///
/// Implements: rust-lint/lint-findings
pub(crate) fn findings(folder: &str, findings: &[String]) -> String {
    let noun = if findings.len() == 1 {
        "finding"
    } else {
        "findings"
    };
    format!(
        "{folder}: {} {noun}\n{}",
        findings.len(),
        findings.join("\n")
    )
}

/// One line for a spec finding, with a file under the root written relative.
///
/// Implements: rust-lint/lint-findings
pub(crate) fn spec_line(folder: &str, root: &Path, finding: &SpecFinding) -> String {
    format!(
        "{folder}: {}:{}: {}",
        relative(root, Path::new(&finding.file)),
        finding.line,
        finding.message
    )
}

/// One line for a merge refusal, with a file under the root written relative.
///
/// Implements: rust-lint/lint-findings
pub(crate) fn merge_line(folder: &str, root: &Path, path: &Path, error: &MergeError) -> String {
    format!("{folder}: {}: {error}", relative(root, path))
}

/// One line for a link gate finding, whose location is already relative.
///
/// Implements: rust-lint/lint-findings
pub(crate) fn finding_line(folder: &str, finding: &Finding) -> String {
    format!("{folder}: {finding}")
}

/// A path under `root` written relative to it, or the path as given.
///
/// Implements: rust-lint/lint-findings
fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).map_or_else(
        |_| path.display().to_string(),
        |stripped| stripped.display().to_string(),
    )
}
