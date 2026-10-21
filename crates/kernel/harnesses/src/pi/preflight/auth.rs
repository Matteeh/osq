//! Reading the object `pi auth check --json` writes.

use serde_json::{Map, Value};

/// What one auth check text says about the provider's credentials.
pub(super) struct Assessment {
    /// The status the object named, or the run's fallback status.
    pub(super) status: String,
    /// The reason the object named, or the run's fallback reason.
    pub(super) reason: Option<String>,
}

/// Reads the auth object's status and reason, falling back on a failed run.
///
/// Implements: rust-harnesses/pi-preflight
pub(super) fn assess(stdout: &str, failure: Option<&str>) -> Assessment {
    let object = parse_object(stdout);
    let named_status = string_field(object.as_ref(), "status");
    let reason = string_field(object.as_ref(), "reason").or_else(|| {
        let failure = failure?;
        if named_status.is_some() {
            None
        } else {
            Some(failure.to_owned())
        }
    });
    let status = named_status.unwrap_or_else(|| {
        if failure.is_some() {
            "error".to_owned()
        } else {
            "unknown".to_owned()
        }
    });
    Assessment { status, reason }
}

/// Reads the joined stdout as a JSON object, or nothing when it is not one.
///
/// Implements: rust-harnesses/pi-preflight
fn parse_object(stdout: &str) -> Option<Map<String, Value>> {
    match serde_json::from_str::<Value>(stdout).ok()? {
        Value::Object(object) => Some(object),
        Value::Array(_) | Value::Bool(_) | Value::Null | Value::Number(_) | Value::String(_) => {
            None
        }
    }
}

/// Reads one field as trimmed, non-blank text.
///
/// Implements: rust-harnesses/pi-preflight
fn string_field(object: Option<&Map<String, Value>>, key: &str) -> Option<String> {
    let value = object?.get(key)?.as_str()?.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_owned())
    }
}
