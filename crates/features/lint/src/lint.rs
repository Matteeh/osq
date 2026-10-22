//! Running `lint`: find the active change, validate its deltas and run the link gates.

pub(crate) mod find;
mod text;

use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_linter::change_link_gates;
use osq_kernel_specs::{MergeChangeError, validate_change, validate_merged_change};
use osq_kernel_storage::{ChangeEntry, list_changes};

use text::{finding_line, merge_line, spec_line};

/// The folder of the link gates' decisions.
const DECISIONS: &str = "decisions";
/// The folder of the living specs and the changes.
const OPENSPEC: &str = "openspec";
/// The sidecar group the complete-capabilities gate checks.
const GROUP: &str = "rust";

/// Runs `lint` for one query, returning the finding text or `valid`.
///
/// # Errors
///
/// Returns a `Failed` error with the command `lint` when no active change
/// matches, when a check cannot run, or when the change has any finding.
///
/// Implements: rust-lint/lint-lookup
/// Implements: rust-lint/lint-findings
/// Implements: rust-lint/lint-errors
pub(crate) fn run_lint(root: &Path, query: &str) -> Result<String, FeatureError> {
    let changes = list_changes(root);
    let entry = find::find_change(&changes, query)
        .ok_or_else(|| failed(text::not_found(query, &root.join(OPENSPEC).join("changes"))))?;
    let mut findings = spec_findings(root, entry)?;
    findings.extend(link_findings(root, &entry.folder)?);
    if findings.is_empty() {
        Ok(text::valid(&entry.folder))
    } else {
        Err(failed(text::findings(&entry.folder, &findings)))
    }
}

/// Validates the change's delta specs, then their merge when the deltas are clean.
///
/// Implements: rust-lint/lint-findings
/// Implements: rust-lint/lint-errors
fn spec_findings(root: &Path, entry: &ChangeEntry) -> Result<Vec<String>, FeatureError> {
    let specs = root.join(OPENSPEC).join("specs");
    let findings =
        validate_change(&entry.path, &specs).map_err(|error| failed(error.to_string()))?;
    if !findings.is_empty() {
        return Ok(findings
            .iter()
            .map(|finding| spec_line(&entry.folder, root, finding))
            .collect());
    }
    match validate_merged_change(&entry.path, &specs) {
        Ok(findings) => Ok(findings
            .iter()
            .map(|finding| spec_line(&entry.folder, root, finding))
            .collect()),
        Err(MergeChangeError::Merge { path, error }) => {
            Ok(vec![merge_line(&entry.folder, root, &path, &error)])
        }
        Err(MergeChangeError::Read(error)) => Err(failed(error.to_string())),
    }
}

/// Runs the link gates over the project with the change in flight.
///
/// Implements: rust-lint/lint-findings
/// Implements: rust-lint/lint-errors
fn link_findings(root: &Path, folder: &str) -> Result<Vec<String>, FeatureError> {
    let change = Path::new(OPENSPEC).join("changes").join(folder);
    let findings = change_link_gates(
        root,
        Path::new(DECISIONS),
        Path::new(OPENSPEC),
        GROUP,
        &change,
    )
    .map_err(|error| failed(error.to_string()))?;
    Ok(findings
        .iter()
        .map(|finding| finding_line(folder, finding))
        .collect())
}

/// Builds the failed error for a check that cannot run.
fn failed(message: String) -> FeatureError {
    FeatureError::failed("lint", message)
}
