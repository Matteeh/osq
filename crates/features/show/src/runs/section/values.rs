//! Reading JavaScript-shaped values out of event data.

use serde_json::Value;

use crate::events::Event;

/// A named field of an event's data.
pub(super) fn field<'a>(event: &'a Event, name: &str) -> Option<&'a Value> {
    event.field(name)
}

/// A value when it is a string.
pub(super) fn text(value: Option<&Value>) -> Option<&str> {
    value.and_then(Value::as_str)
}

/// A string value's trimmed text, or `None` when empty.
pub(super) fn trimmed(value: Option<&Value>) -> Option<String> {
    text(value)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToOwned::to_owned)
}

/// A value when it is a finite number.
pub(super) fn number(value: Option<&Value>) -> Option<f64> {
    value.and_then(Value::as_f64)
}

/// Whether a value is the boolean `true`.
pub(super) fn flag(value: Option<&Value>) -> bool {
    value.and_then(Value::as_bool) == Some(true)
}

/// The trimmed non-empty strings of an array, as TypeScript's `stringList`.
pub(super) fn strings(value: Option<&Value>) -> Vec<String> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| trimmed(Some(item)))
        .collect()
}

/// A number with JavaScript's `toFixed(2)` digits.
pub(super) fn fixed_two(value: f64) -> String {
    format!("{value:.2}")
}
