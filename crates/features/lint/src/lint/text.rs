//! The text `lint` prints: one line per finding and the count line above them.

use std::path::Path;

use osq_core::Finding as LinkFinding;
use osq_kernel_specs::{MergeError, SpecFinding};

use super::finding::{Finding as RuleFinding, Origin, ReportFinding};

/// The repository group header printed once above every repository finding.
pub(crate) const REPOSITORY_HEADER: &str =
    "repository: findings about other changes and living specs; they do not affect the exit code";

/// The refusal for a query that names no active change.
///
/// Implements: rust-lint/lint-lookup
pub(crate) fn not_found(query: &str, changes: &Path) -> String {
    format!("Spec \"{query}\" not found in {}", changes.display())
}

/// The line for a change with no error.
///
/// Implements: rust-lint/lint-findings
pub(crate) fn valid(folder: &str) -> String {
    format!("{folder}: valid")
}

/// One line for a proposal rule or banned word finding, as `formatFinding` writes it.
///
/// Implements: rust-lint/lint-findings
pub(crate) fn rule_line(folder: &str, finding: &RuleFinding) -> String {
    let qualifier = finding
        .section
        .as_ref()
        .map_or_else(String::new, |section| format!(" ({section})"));
    format!(
        "{folder}: {} {}{qualifier}: {}",
        finding.severity.as_str(),
        finding.file,
        finding.message
    )
}

/// The count line that opens a change with findings.
///
/// Implements: rust-lint/lint-findings
pub(crate) fn count(folder: &str, findings: usize) -> String {
    let noun = if findings == 1 { "finding" } else { "findings" };
    format!("{folder}: {findings} {noun}")
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
pub(crate) fn link_line(folder: &str, finding: &LinkFinding) -> String {
    format!("{folder}: {finding}")
}

/// One line for any report finding, from the source that rendered it.
///
/// Implements: rust-lint/lint-findings
pub(crate) fn report_line(folder: &str, root: &Path, finding: &ReportFinding) -> String {
    match &finding.origin {
        Origin::Rule(rule) => rule_line(folder, rule),
        Origin::Spec(spec) => spec_line(folder, root, spec),
        Origin::Merge { path, error } => merge_line(folder, root, path, error),
        Origin::Link(link) => link_line(folder, link),
    }
}

/// The repository count line TypeScript's `formatRepositoryCount` writes.
///
/// Implements: rust-lint/lint-repository-findings
pub(crate) fn repository_count(count: usize) -> String {
    let noun = if count == 1 { "finding" } else { "findings" };
    format!(
        "repository: {count} {noun} about other changes and living specs; osq lint --repository \
         lists them"
    )
}

/// A path under `root` written relative to it, or the path as given.
///
/// Implements: rust-lint/lint-findings
pub(crate) fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).map_or_else(
        |_| path.display().to_string(),
        |stripped| stripped.display().to_string(),
    )
}
