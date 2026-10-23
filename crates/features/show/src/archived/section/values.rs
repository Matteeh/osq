//! Value helpers shared by the archived sections.
//!
//! Implements: rust-show/show-text

use serde_json::Value;

/// A trimmed non-empty string field.
///
/// Implements: rust-show/show-text
pub(super) fn trimmed(value: Option<&Value>) -> Option<String> {
    let text = value?.as_str()?.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

/// A finite JSON number.
///
/// Implements: rust-show/show-text
pub(super) fn number(value: Option<&Value>) -> Option<f64> {
    value?.as_f64()
}

/// A string field's text.
///
/// Implements: rust-show/show-text
pub(super) fn text(value: Option<&Value>) -> Option<&str> {
    value?.as_str()
}

/// A value as JavaScript's `String()` prints it, with `undefined` for absence.
///
/// Implements: rust-show/show-text
pub(super) fn render(value: Option<&Value>) -> String {
    match value {
        Some(value) => js_string(value),
        None => "undefined".to_owned(),
    }
}

/// A value as JavaScript's `String()` prints it, with a fallback for nullish.
///
/// Implements: rust-show/show-text
pub(super) fn render_nullish(value: Option<&Value>, fallback: &str) -> String {
    match value {
        None | Some(Value::Null) => fallback.to_owned(),
        Some(value) => js_string(value),
    }
}

/// A value as JavaScript's `String()` prints it.
///
/// Implements: rust-show/show-text
pub(super) fn js_string(value: &Value) -> String {
    match value {
        Value::Null => "null".to_owned(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => crate::events::js_number(number.as_f64().unwrap_or_default()),
        Value::String(text) => text.clone(),
        Value::Array(items) => array_text(items),
        Value::Object(_) => "[object Object]".to_owned(),
    }
}

/// A JSON array as JavaScript's `String()` prints it.
fn array_text(items: &[Value]) -> String {
    items
        .iter()
        .map(|item| {
            if item.is_null() {
                String::new()
            } else {
                js_string(item)
            }
        })
        .collect::<Vec<_>>()
        .join(",")
}

/// A JSON array as JavaScript's `join(', ')` prints it.
///
/// Implements: rust-show/show-text
pub(super) fn join(items: &[Value]) -> String {
    items
        .iter()
        .map(|item| {
            if item.is_null() {
                String::new()
            } else {
                js_string(item)
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// A number rounded as JavaScript's `Math.round` rounds it.
///
/// Implements: rust-show/show-text
pub(super) fn round(value: f64) -> f64 {
    let rounded = (value + 0.5).floor();
    if rounded == 0.0 { 0.0 } else { rounded }
}

/// A timestamp's milliseconds when JavaScript's `Date.parse` accepts it.
///
/// Implements: rust-show/show-text
pub(super) fn time(text: &str) -> Option<i64> {
    osq_kernel_storage::timestamp_ms(text)
}
