//! Parsing one task event stream into the events the history folds count.
//!
//! Implements: rust-storage/task-history

use serde_json::{Map, Value};

/// One parsed event line: its `type` and its object `data`.
#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct Event {
    /// The event's `type` member when it is a string.
    kind: Option<String>,
    /// The event's `data` member when it is a JSON object.
    data: Option<Map<String, Value>>,
}

impl Event {
    /// The event's `type` string, or `None` without one.
    pub(super) fn kind(&self) -> Option<&str> {
        self.kind.as_deref()
    }

    /// A data member's string value, or `None` without one.
    pub(super) fn text(&self, key: &str) -> Option<&str> {
        self.data.as_ref()?.get(key)?.as_str()
    }

    /// A data member's finite numeric value, or `None` without one.
    pub(super) fn number(&self, key: &str) -> Option<f64> {
        self.data
            .as_ref()?
            .get(key)?
            .as_f64()
            .filter(|number| number.is_finite())
    }

    /// Whether a data member is exactly the boolean `true`.
    pub(super) fn is_true(&self, key: &str) -> bool {
        self.data
            .as_ref()
            .and_then(|data| data.get(key))
            .and_then(Value::as_bool)
            == Some(true)
    }

    /// Whether a data member is a non-empty array.
    pub(super) fn is_non_empty_array(&self, key: &str) -> bool {
        matches!(
            self.data.as_ref().and_then(|data| data.get(key)),
            Some(Value::Array(items)) if !items.is_empty()
        )
    }
}

/// Parses a stream's lines in file order, skipping blank and non-object lines.
pub(super) fn parse(content: &str) -> Vec<Event> {
    content.split('\n').filter_map(parse_line).collect()
}

/// Parses one line into an event, or `None` when it is not a JSON object.
fn parse_line(line: &str) -> Option<Event> {
    let value = serde_json::from_str::<Value>(line.trim()).ok()?;
    let object = value.as_object()?;
    Some(Event {
        kind: object
            .get("type")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        data: object.get("data").and_then(Value::as_object).cloned(),
    })
}
