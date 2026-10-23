//! The event model and JavaScript-shaped value rendering.
//!
//! Event `data` keys stay in file order so the timeline prints them as
//! TypeScript's `Object.entries` does.

use serde::Deserialize;
use serde::de::{Deserializer, MapAccess, Visitor};
use serde_json::Value;

/// One event's data object, with its keys in file order.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Entries(pub(crate) Vec<(String, Value)>);

impl<'de> Deserialize<'de> for Entries {
    /// Reads a JSON object as ordered key-value pairs.
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        /// Collects a JSON object's entries without sorting its keys.
        struct EntriesVisitor;

        impl<'de> Visitor<'de> for EntriesVisitor {
            type Value = Entries;

            /// Names the expected JSON value. The message is never observable:
            /// `Data`'s untagged deserializer accepts every JSON value, so an
            /// equivalent "return `Ok(Default::default())`" mutant is skipped.
            #[cfg_attr(docsrs, mutants::skip)]
            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("a JSON object")
            }

            /// Reads every key and value in the object's own order.
            fn visit_map<A: MapAccess<'de>>(self, mut access: A) -> Result<Entries, A::Error> {
                let mut entries = Vec::new();
                while let Some((key, value)) = access.next_entry::<String, Value>()? {
                    entries.push((key, value));
                }
                Ok(Entries(entries))
            }
        }

        deserializer.deserialize_map(EntriesVisitor)
    }
}

/// One event's `data` value when it is an object or an array.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(untagged)]
pub(crate) enum Data {
    /// A JSON object with its keys in file order.
    Map(Entries),
    /// A JSON array.
    Array(Vec<Value>),
    /// A JSON primitive, which TypeScript treats as no data at all.
    Other(Value),
}

impl Data {
    /// A named field of an object's data.
    pub(crate) fn get(&self, name: &str) -> Option<&Value> {
        match self {
            Self::Map(entries) => entries
                .0
                .iter()
                .rev()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value),
            Self::Array(_) | Self::Other(_) => None,
        }
    }

    /// The entries the timeline prints, keys in JavaScript's order.
    pub(crate) fn entries(&self) -> Vec<(String, &Value)> {
        match self {
            Self::Map(entries) => entries
                .0
                .iter()
                .map(|(key, value)| (key.clone(), value))
                .collect(),
            Self::Array(items) => items
                .iter()
                .enumerate()
                .map(|(index, value)| (index.to_string(), value))
                .collect(),
            Self::Other(_) => Vec::new(),
        }
    }
}

/// One event of a change's timeline.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Event {
    /// The stream file's task name, without `.jsonl`.
    pub(crate) stream: String,
    /// The task number the event line or its stream names.
    pub(crate) task_number: String,
    /// The event type.
    pub(crate) kind: String,
    /// The timestamp as written, or empty text.
    pub(crate) timestamp: String,
    /// The event's object or array data.
    pub(crate) data: Option<Data>,
}

impl Event {
    /// A named field of the event's data, or `None` without one.
    pub(crate) fn field(&self, name: &str) -> Option<&Value> {
        self.data.as_ref()?.get(name)
    }
}

/// One event line before its defaults and string fields are applied.
#[derive(Debug, Default, Deserialize)]
struct RawEvent {
    /// The line's `taskNumber`.
    #[serde(rename = "taskNumber")]
    task_number: Option<Value>,
    /// The line's `type`.
    #[serde(rename = "type")]
    kind: Option<Value>,
    /// The line's `timestamp`.
    timestamp: Option<Value>,
    /// The line's `data`.
    data: Option<Data>,
}

impl RawEvent {
    /// Applies TypeScript's fallbacks and `String()` conversion to one event.
    fn into_event(self, stream: &str) -> Event {
        let task_number = self
            .task_number
            .filter(truthy)
            .map_or_else(|| stream.to_owned(), |value| js_string(&value));
        let kind = self
            .kind
            .filter(truthy)
            .map_or_else(|| "unknown".to_owned(), |value| js_string(&value));
        let timestamp = self
            .timestamp
            .filter(truthy)
            .map_or_else(String::new, |value| js_string(&value));
        let data = self
            .data
            .and_then(|data| (!matches!(data, Data::Other(_))).then_some(data));
        Event {
            stream: stream.to_owned(),
            task_number,
            kind,
            timestamp,
            data,
        }
    }
}

/// Parses one non-empty event line, or `None` when it is not JSON.
pub(crate) fn parse(line: &str, stream: &str) -> Option<Event> {
    let raw = if line.starts_with('{') {
        serde_json::from_str::<RawEvent>(line).ok()?
    } else {
        serde_json::from_str::<Value>(line).ok()?;
        RawEvent::default()
    };
    Some(raw.into_event(stream))
}

/// Whether JavaScript treats a JSON value as true.
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(flag) => *flag,
        Value::Number(number) => number.as_f64().is_some_and(|number| number != 0.0),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// A value as JavaScript's `String()` prints it.
pub(crate) fn js_string(value: &Value) -> String {
    match value {
        Value::Null => "null".to_owned(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => js_number(number.as_f64().unwrap_or_default()),
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .map(|item| {
                if item.is_null() {
                    String::new()
                } else {
                    js_string(item)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_owned(),
    }
}

/// A number as JavaScript's `String()` prints it.
pub(crate) fn js_number(number: f64) -> String {
    if number == 0.0 {
        "0".to_owned()
    } else {
        format!("{number}")
    }
}
