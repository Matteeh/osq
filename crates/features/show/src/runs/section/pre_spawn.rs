//! The `Pre-spawn verify:` line of one task.

use serde_json::Value;

use crate::events::Event;

use super::values;

/// The latest pre-spawn verify line, or `None` without a pre-spawn event.
pub(super) fn line(events: &[Event]) -> Option<String> {
    let latest = events.iter().rfind(|event| {
        event.kind == "verify_ran"
            && values::text(values::field(event, "phase")) == Some("pre_spawn")
    })?;
    let exit_code = values::number(values::field(latest, "exitCode"));
    let expected = values::text(values::field(latest, "expected"))
        .map(str::trim)
        .unwrap_or_default();
    let (Some(exit_code), false) = (exit_code, expected.is_empty()) else {
        return Some("      Pre-spawn verify: unavailable".to_owned());
    };
    let missing = missing_paths(values::field(latest, "missingPaths"));
    Some(format!(
        "      Pre-spawn verify: {}",
        start(expected, exit_code, &missing)
    ))
}

/// The recorded missing paths of a well-formed non-empty array.
fn missing_paths(value: Option<&Value>) -> Vec<String> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    if items.is_empty()
        || !items
            .iter()
            .all(|item| item.as_str().is_some_and(|text| !text.trim().is_empty()))
    {
        return Vec::new();
    }
    items
        .iter()
        .filter_map(|item| item.as_str().map(str::trim).map(ToOwned::to_owned))
        .collect()
}

/// Words a pre-spawn start from its expected state, exit code and missing paths.
fn start(expected: &str, exit_code: f64, missing: &[String]) -> String {
    if exit_code != 0.0 || !missing.is_empty() {
        let base = if missing.is_empty() {
            "started red: verify fails".to_owned()
        } else {
            format!("started red: {} missing", missing.join(", "))
        };
        return if expected == "green" {
            format!("{base}, but it declared {expected}")
        } else {
            base
        };
    }
    if expected == "red" {
        format!("started green, but it declared {expected}")
    } else {
        "started green, as declared".to_owned()
    }
}
