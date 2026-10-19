//! Reading the CLI's JSON and turning an item into an outcome.

use super::super::cli::text_of;
use super::super::report::Outcome;
use osq_kernel_specs::{
    SpecFinding, validate_change, validate_delta, validate_living_spec, validate_merged_change,
};
use serde_json::Value;
use std::path::Path;
use std::process::Output;

/// The `items` array of a `--json` run, or none when the output is not JSON.
pub(super) fn items_of(output: &Output) -> Option<Vec<Value>> {
    let text = String::from_utf8_lossy(&output.stdout);
    let value: Value = serde_json::from_str(&text).ok()?;
    value.get("items")?.as_array().cloned()
}

/// The outcome of a run that validates exactly one item.
pub(super) fn single_item_outcome(output: &Output) -> Outcome {
    match items_of(output).as_deref().and_then(|items| items.first()) {
        Some(item) => outcome_of(item),
        None => Outcome::Fail(vec![format!(
            "the CLI printed no JSON item: {}",
            text_of(output)
        )]),
    }
}

/// The outcome of the item with `id` in a multi-item run, failing when absent.
pub(super) fn item_outcome(items: &[Value], id: &str) -> Outcome {
    let Some(item) = items
        .iter()
        .find(|item| item.get("id").and_then(Value::as_str) == Some(id))
    else {
        return Outcome::Fail(vec![format!("the CLI reported no item `{id}`")]);
    };
    outcome_of(item)
}

/// The outcome of one `--json` item value.
pub(super) fn outcome_of(item: &Value) -> Outcome {
    if item.get("valid").and_then(Value::as_bool) == Some(true) {
        return Outcome::Pass;
    }
    Outcome::Fail(issue_messages(item))
}

/// The item's ERROR and WARNING messages, in order.
fn issue_messages(item: &Value) -> Vec<String> {
    let mut messages = Vec::new();
    let Some(issues) = item.get("issues").and_then(Value::as_array) else {
        return messages;
    };
    for issue in issues {
        let level = issue
            .get("level")
            .and_then(Value::as_str)
            .unwrap_or("ERROR");
        if level == "ERROR" || level == "WARNING" {
            let message = issue.get("message").and_then(Value::as_str).unwrap_or("");
            messages.push(format!("{level} {message}"));
        }
    }
    messages
}

/// The Rust findings of one living spec.
pub(super) fn living_outcome(label: &str, text: &str) -> Outcome {
    Outcome::from_details(finding_lines(&validate_living_spec(label, text)))
}

/// The Rust findings of a delta spec that need no living spec.
pub(super) fn delta_outcome(label: &str, text: &str) -> Outcome {
    Outcome::from_details(finding_lines(&validate_delta(label, text)))
}

/// The Rust outcome of a change, from `validate_change` and
/// `validate_merged_change`.
pub(super) fn change_outcome(change: &Path, specs: &Path) -> Outcome {
    let mut details = Vec::new();
    match validate_change(change, specs) {
        Ok(found) => details.extend(finding_lines(&found)),
        Err(error) => details.push(format!("validate_change read error: {error}")),
    }
    match validate_merged_change(change, specs) {
        Ok(found) => details.extend(finding_lines(&found)),
        Err(error) => details.push(format!("validate_merged_change error: {error}")),
    }
    Outcome::from_details(details)
}

/// One finding as a failure line.
fn finding_line(finding: &SpecFinding) -> String {
    let requirement = finding
        .requirement
        .as_deref()
        .map_or(String::new(), |name| format!(" for `{name}`"));
    format!(
        "{} at line {}{}: {}",
        finding.code.as_str(),
        finding.line,
        requirement,
        finding.message
    )
}

/// The failure lines of a list of findings.
fn finding_lines(found: &[SpecFinding]) -> Vec<String> {
    found.iter().map(finding_line).collect()
}
