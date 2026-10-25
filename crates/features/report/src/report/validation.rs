//! Summarizing the latest validator run of every archived change.
//!
//! Implements: rust-report/report-validation

use osq_kernel_storage::{ChangeEntry, Location, read_latest_validation};
use serde_json::{Value, json};

use super::js_number;
use super::order::compare_numeric_prefix;

/// One archived change's latest validator run.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ValidationEntry {
    /// The change's folder name.
    pub(crate) change: String,
    /// The run's trimmed outcome.
    pub(crate) outcome: String,
    /// The findings a validated run reported.
    pub(crate) findings: u64,
}

/// Every archived change with a readable run and its totals.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct Validation {
    /// The archived changes holding a readable run.
    pub(crate) changes: u64,
    /// Those whose outcome is `validated`.
    pub(crate) validated: u64,
    /// The sum of the validated runs' findings.
    pub(crate) findings: u64,
    /// One entry per archived change with a readable run.
    pub(crate) per_change: Vec<ValidationEntry>,
}

/// Reads every archived entry's latest readable validator run.
///
/// Gives `None` when no archived change holds a readable run.
///
/// Implements: rust-report/report-validation
pub(crate) fn read(entries: &[ChangeEntry]) -> Option<Validation> {
    let mut per_change = Vec::new();
    for entry in entries {
        if entry.location != Location::Archived {
            continue;
        }
        let Some(run) = read_latest_validation(&entry.path) else {
            continue;
        };
        per_change.push(ValidationEntry {
            change: entry.folder.clone(),
            outcome: run.outcome,
            findings: run.findings,
        });
    }
    if per_change.is_empty() {
        return None;
    }
    per_change.sort_by(|left, right| compare_numeric_prefix(&left.change, &right.change));
    let changes = u64::try_from(per_change.len()).expect("a change count fits in a u64");
    let validated_runs = per_change
        .iter()
        .filter(|entry| entry.outcome == "validated");
    let validated = u64::try_from(validated_runs.clone().count()).expect("a run count fits");
    let findings = validated_runs.map(|entry| entry.findings).sum();
    Some(Validation {
        changes,
        validated,
        findings,
        per_change,
    })
}

/// Writes the `Validation:` lines, without a trailing newline.
///
/// Implements: rust-report/report-validation
pub(crate) fn text(validation: &Validation) -> Vec<String> {
    let mut lines = vec![
        "Validation:".to_owned(),
        format!(
            "  {} of {} changes validated, {} findings",
            validation.validated, validation.changes, validation.findings
        ),
    ];
    for entry in &validation.per_change {
        if entry.outcome == "validated" {
            lines.push(format!("  {}: {} findings", entry.change, entry.findings));
        } else {
            lines.push(format!(
                "  {}: not validated ({})",
                entry.change, entry.outcome
            ));
        }
    }
    lines
}

/// Writes the `validation` member as `serializeSortedJson` writes it.
///
/// Implements: rust-report/report-validation
pub(crate) fn json(validation: &Validation) -> Value {
    let rows: Vec<Value> = validation
        .per_change
        .iter()
        .map(|entry| {
            json!({
                "change": entry.change,
                "outcome": entry.outcome,
                "findings": js_number::json_number(whole(entry.findings)),
            })
        })
        .collect();
    json!({
        "changes": js_number::json_number(whole(validation.changes)),
        "validated": js_number::json_number(whole(validation.validated)),
        "findings": js_number::json_number(whole(validation.findings)),
        "perChange": rows,
    })
}

/// A count as the JavaScript number it is written as.
fn whole(value: u64) -> f64 {
    f64::from(u32::try_from(value).unwrap_or(u32::MAX))
}
