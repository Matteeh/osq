//! The JSON event list and one event object.

use crate::events::Event;

use super::value::{self, Value};

/// An array of event objects.
/// Implements: rust-show/show-json
pub(super) fn array(events: &[Event]) -> Value {
    Value::Array(events.iter().map(one).collect())
}

/// One event object, with its `data` only when the line holds an object or array.
/// Implements: rust-show/show-json
fn one(event: &Event) -> Value {
    let mut fields = vec![
        ("taskNumber", Value::string(event.task_number.clone())),
        ("type", Value::string(event.kind.clone())),
        ("timestamp", Value::string(event.timestamp.clone())),
    ];
    if let Some(data) = data(event) {
        fields.push(("data", data));
    }
    Value::object(fields)
}

/// The event's `data` value when it is an object or array, in file key order.
/// Implements: rust-show/show-json
pub(super) fn data(event: &Event) -> Option<Value> {
    let parsed = value::parse(event.raw.as_deref()?)?;
    match parsed.field("data")? {
        data @ (Value::Object(_) | Value::Array(_)) => Some(data.clone()),
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => None,
    }
}
