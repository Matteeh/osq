//! Builders for the golden entries of rust-specs "TypeScript parse parity".

use osq_kernel_specs::{ChecklistItem, Delta, LivingSpec, Proposal, Sidecar, TaskFile};
use serde::Serialize;
use serde_json::{Map, Value};

/// Builds a delta golden entry `{path, delta}` from a parse.
#[must_use]
pub fn delta_entry(path: &str, delta: &Delta) -> Value {
    entry(path, "delta", delta)
}

/// Builds a task-file golden entry `{path, task}` from a parse.
#[must_use]
pub fn task_entry(path: &str, task: &TaskFile) -> Value {
    entry(path, "task", task)
}

/// Builds a proposal golden entry `{path, proposal}` from a parse.
#[must_use]
pub fn proposal_entry(path: &str, proposal: &Proposal) -> Value {
    entry(path, "proposal", proposal)
}

/// Builds a task-list golden entry `{path, items}` from a parse.
#[must_use]
pub fn task_list_entry(path: &str, items: &[ChecklistItem]) -> Value {
    entry(path, "items", items)
}

/// Builds a living golden entry `{capability, spec, sidecar}` from a parse.
#[must_use]
pub fn living_entry(capability: &str, spec: &LivingSpec, sidecar: &Sidecar) -> Value {
    let mut fields = Map::new();
    fields.insert(
        "capability".to_string(),
        Value::String(capability.to_string()),
    );
    fields.insert("spec".to_string(), value_of(spec));
    fields.insert("sidecar".to_string(), sidecar_value(sidecar));
    Value::Object(fields)
}

/// Builds a sidecar value `{group, tags, problems}` with no problems.
fn sidecar_value(sidecar: &Sidecar) -> Value {
    match value_of(sidecar) {
        Value::Object(mut fields) => {
            fields.insert("problems".to_string(), Value::Array(Vec::new()));
            Value::Object(fields)
        }
        other => other,
    }
}

/// Builds a golden entry with one `path` and one value field.
fn entry<T: Serialize + ?Sized>(path: &str, key: &str, value: &T) -> Value {
    let mut fields = Map::new();
    fields.insert("path".to_string(), Value::String(path.to_string()));
    fields.insert(key.to_string(), value_of(value));
    Value::Object(fields)
}

/// A serialized value, or null when serialization fails.
fn value_of<T: Serialize + ?Sized>(item: &T) -> Value {
    serde_json::to_value(item).unwrap_or(Value::Null)
}
