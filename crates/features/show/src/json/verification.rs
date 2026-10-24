//! The JSON verification history of one archived change.

use crate::archived::Verification;

use super::value::Value;

/// One archived change's check and outcome rows.
/// Implements: rust-show/show-json
pub(super) fn value(history: &Verification) -> Value {
    Value::object(vec![
        (
            "checks",
            Value::Array(
                history
                    .checks
                    .iter()
                    .map(|check| {
                        Value::object(vec![
                            ("time", Value::string(check.time.clone())),
                            ("command", Value::string(check.command.clone())),
                            ("exitCode", optional_number(check.exit)),
                        ])
                    })
                    .collect(),
            ),
        ),
        (
            "outcomes",
            Value::Array(
                history
                    .outcomes
                    .iter()
                    .map(|outcome| {
                        Value::object(vec![
                            ("time", Value::string(outcome.time.clone())),
                            ("outcome", optional_string(outcome.outcome.as_deref())),
                            ("note", optional_string(outcome.note.as_deref())),
                        ])
                    })
                    .collect(),
            ),
        ),
    ])
}

/// A string value, or `null`.
fn optional_string(value: Option<&str>) -> Value {
    value.map_or(Value::Null, Value::string)
}

/// A number value, or `null`.
fn optional_number(value: Option<f64>) -> Value {
    value.map_or(Value::Null, Value::number)
}
