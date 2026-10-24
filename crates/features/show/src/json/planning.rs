//! The JSON planning sessions and recertifications of one change.

use crate::archived::Row;
use crate::model::Change;
use crate::planning::{Session, sessions as correlate};

use super::value::Value;

/// The planning session array of one change.
/// Implements: rust-show/show-json
pub(super) fn sessions(change: &Change) -> Value {
    Value::Array(
        correlate(&change.path)
            .iter()
            .map(session)
            .collect::<Vec<Value>>(),
    )
}

/// One planning session object.
/// Implements: rust-show/show-json
fn session(session: &Session) -> Value {
    let mut fields = vec![
        ("sessionId", Value::string(session.id.clone())),
        ("startTime", Value::string(session.start.clone())),
        ("harness", Value::string(session.harness.clone())),
        ("model", text(session.model.as_ref())),
    ];
    if let Some(agent) = &session.agent {
        fields.push(("agent", Value::string(agent.clone())));
    }
    fields.push(("exitCode", number(session.exit_code)));
    fields.push(("wallSeconds", number(session.wall_seconds)));
    Value::object(fields)
}

/// One recertification row object.
/// Implements: rust-show/show-json
pub(super) fn recertification(row: &Row) -> Value {
    Value::object(vec![
        ("taskNumber", Value::string(row.task.clone())),
        ("timestamp", text(row.timestamp.as_ref())),
        ("outcome", text(row.outcome.as_ref())),
        ("differingPaths", Value::strings(&row.differing_paths)),
        ("attribution", attributions(row)),
        ("verify", text(row.verify.as_ref())),
        ("exitCode", number(row.exit_code)),
        ("timedOut", flag(row.timed_out)),
    ])
}

/// The attribution array of one row.
/// Implements: rust-show/show-json
fn attributions(row: &Row) -> Value {
    Value::Array(
        row.attribution
            .iter()
            .map(|(path, attribution)| {
                Value::object(vec![
                    ("path", Value::string(path.clone())),
                    ("attribution", Value::string(attribution.clone())),
                ])
            })
            .collect(),
    )
}

/// A string value, or `null`.
/// Implements: rust-show/show-json
fn text(value: Option<&String>) -> Value {
    value.map_or(Value::Null, |text| Value::string(text.clone()))
}

/// A number value, or `null`.
/// Implements: rust-show/show-json
fn number(value: Option<f64>) -> Value {
    value.map_or(Value::Null, Value::number)
}

/// A boolean value, or `null`.
/// Implements: rust-show/show-json
fn flag(value: Option<bool>) -> Value {
    value.map_or(Value::Null, Value::Bool)
}
