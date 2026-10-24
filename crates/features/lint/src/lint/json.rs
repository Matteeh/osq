//! The `lint --json` document TypeScript's `buildLintJson` builds.

use osq_core::Output;

use super::ChangeReport;
use super::finding::ReportFinding;

/// Returns the document as text when every checked change is valid, and with
/// the exit code 1 otherwise.
///
/// Implements: rust-lint/lint-json
pub(crate) fn output(checked: &[ChangeReport], repository: &[ReportFinding]) -> Output {
    let valid = checked.iter().all(ChangeReport::valid);
    let document = document(checked, repository);
    if valid {
        Output::text(document)
    } else {
        Output::with_code(document, 1)
    }
}

/// Builds the one-line document with its keys in TypeScript's order.
///
/// Implements: rust-lint/lint-json
fn document(checked: &[ChangeReport], repository: &[ReportFinding]) -> String {
    let valid = checked.iter().all(ChangeReport::valid);
    let mut text = format!("{{\"valid\":{valid},\"changes\":[");
    for (index, change) in checked.iter().enumerate() {
        if index > 0 {
            text.push(',');
        }
        text.push_str(&change_document(change));
    }
    text.push_str("],\"repository\":[");
    for (index, finding) in repository.iter().enumerate() {
        if index > 0 {
            text.push(',');
        }
        text.push_str(&finding_document(finding));
    }
    text.push_str("]}\n");
    text
}

/// Builds one change's object, its findings in the order the checks give them.
///
/// Implements: rust-lint/lint-json
fn change_document(change: &ChangeReport) -> String {
    let valid = change.valid();
    let mut text = format!(
        "{{\"change\":{},\"valid\":{valid},\"findings\":[",
        quote(&change.folder)
    );
    for (index, finding) in change.findings.iter().enumerate() {
        if index > 0 {
            text.push(',');
        }
        text.push_str(&finding_document(finding));
    }
    text.push_str("]}");
    text
}

/// Builds one finding's object, with the fields its source gives it.
///
/// Implements: rust-lint/lint-json
fn finding_document(finding: &ReportFinding) -> String {
    format!(
        "{{\"severity\":{},\"file\":{},\"requirement\":{},\"section\":{},\"message\":{}}}",
        quote(finding.severity.as_str()),
        quote(&finding_file(finding)),
        optional(finding.requirement.as_deref()),
        optional(finding.section.as_deref()),
        quote(&finding.message)
    )
}

/// The finding's file, with `:<line>` appended when it has a line.
///
/// Implements: rust-lint/lint-json
fn finding_file(finding: &ReportFinding) -> String {
    finding.line.map_or_else(
        || finding.file.clone(),
        |line| format!("{}:{line}", finding.file),
    )
}

/// A JSON string when the value is present, and `null` when it is missing.
///
/// Implements: rust-lint/lint-json
fn optional(value: Option<&str>) -> String {
    value.map_or_else(|| "null".to_owned(), quote)
}

/// Escapes one JSON string as `serde_json` writes it.
///
/// Implements: rust-lint/lint-json
fn quote(text: &str) -> String {
    serde_json::to_string(text).expect("a string serializes")
}
