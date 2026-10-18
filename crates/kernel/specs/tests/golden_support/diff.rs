//! Naming the first difference between two JSON values.

use serde_json::{Map, Value};

/// The first place two JSON values differ.
#[derive(Debug, Clone, PartialEq)]
pub struct Difference {
    /// The JSON pointer to the differing value, such as `/delta/title`.
    pub pointer: String,
    /// The value the golden holds.
    pub expected: Value,
    /// The value the parse produced.
    pub actual: Value,
}

impl std::fmt::Display for Difference {
    /// Writes the pointer and both values.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "{}: expected {}, got {}",
            self.pointer, self.expected, self.actual
        )
    }
}

/// Names the first difference between two JSON values, or none when equal.
#[must_use]
pub fn first_difference(expected: &Value, actual: &Value) -> Option<Difference> {
    difference_at("", expected, actual)
}

/// The first difference at or below `pointer`.
fn difference_at(pointer: &str, expected: &Value, actual: &Value) -> Option<Difference> {
    match (expected, actual) {
        (Value::Object(expected_fields), Value::Object(actual_fields)) => {
            difference_in_object(pointer, expected_fields, actual_fields)
        }
        (Value::Array(expected_items), Value::Array(actual_items)) => {
            difference_in_array(pointer, expected_items, actual_items)
        }
        _ if expected == actual => None,
        _ => Some(difference(pointer, expected, actual)),
    }
}

/// The first difference between two objects.
fn difference_in_object(
    pointer: &str,
    expected: &Map<String, Value>,
    actual: &Map<String, Value>,
) -> Option<Difference> {
    for (key, expected_item) in expected {
        let child = child_pointer(pointer, key);
        match actual.get(key) {
            Some(actual_item) => {
                if let Some(found) = difference_at(&child, expected_item, actual_item) {
                    return Some(found);
                }
            }
            None => return Some(difference(&child, expected_item, &Value::Null)),
        }
    }
    for (key, actual_item) in actual {
        if !expected.contains_key(key) {
            let child = child_pointer(pointer, key);
            return Some(difference(&child, &Value::Null, actual_item));
        }
    }
    None
}

/// The first difference between two arrays.
fn difference_in_array(pointer: &str, expected: &[Value], actual: &[Value]) -> Option<Difference> {
    for (index, (expected_item, actual_item)) in expected.iter().zip(actual).enumerate() {
        let child = child_pointer(pointer, &index.to_string());
        if let Some(found) = difference_at(&child, expected_item, actual_item) {
            return Some(found);
        }
    }
    if expected.len() == actual.len() {
        return None;
    }
    let index = expected.len().min(actual.len());
    let child = child_pointer(pointer, &index.to_string());
    Some(difference(
        &child,
        expected.get(index).unwrap_or(&Value::Null),
        actual.get(index).unwrap_or(&Value::Null),
    ))
}

/// A difference holding both values at `pointer`.
fn difference(pointer: &str, expected: &Value, actual: &Value) -> Difference {
    Difference {
        pointer: pointer.to_string(),
        expected: expected.clone(),
        actual: actual.clone(),
    }
}

/// Extends one JSON pointer with an escaped segment, as RFC 6901 says.
fn child_pointer(pointer: &str, segment: &str) -> String {
    let escaped = segment.replace('~', "~0").replace('/', "~1");
    format!("{pointer}/{escaped}")
}
