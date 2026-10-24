//! The JSON task list of one change.

use crate::events::{Event, Events};
use crate::model::{Change, Marker, Task};

use super::document::task_status;
use super::event;
use super::value::Value;

/// The task array of one change.
/// Implements: rust-show/show-json
pub(super) fn array(change: &Change, events: &Events) -> Value {
    Value::Array(
        change
            .tasks
            .iter()
            .map(|task| one(task, events.for_task(&task.number)))
            .collect(),
    )
}

/// One task object, its optional marker values left out when unset.
/// Implements: rust-show/show-json
fn one(task: &Task, events: &[Event]) -> Value {
    let mut fields = vec![
        ("taskNumber", Value::string(task.number.clone())),
        ("fileName", Value::string(format!("{}.md", task.number))),
        ("title", Value::string(task.title.clone())),
        ("status", Value::string(task_status(task.status))),
        ("verify", Value::string(task.verify.clone())),
        ("scope", Value::strings(&task.scope)),
        ("entry", Value::strings(&task.entry)),
        ("skills", Value::strings(&task.skills)),
        ("acceptance", Value::strings(&task.acceptance)),
    ];
    fields.extend(reasons(task));
    if let Some(result) = &task.result {
        fields.push(("resultContent", Value::string(result.clone())));
    }
    fields.push(("events", event::array(events)));
    Value::object(fields)
}

/// The dead and regressed reasons and diagnostics, in TypeScript's order.
/// Implements: rust-show/show-json
fn reasons(task: &Task) -> Vec<(&'static str, Value)> {
    let mut fields = Vec::new();
    if let Some(dead) = &task.dead {
        push_marker("dead", dead, &mut fields);
    }
    if let Some(regressed) = &task.regressed {
        push_marker("regressed", regressed, &mut fields);
    }
    fields
}

/// One marker's reason and diagnostic fields, each only when set.
/// Implements: rust-show/show-json
fn push_marker(prefix: &'static str, marker: &Marker, fields: &mut Vec<(&'static str, Value)>) {
    if !marker.reason.is_empty() {
        let key = if prefix == "dead" {
            "deadReason"
        } else {
            "regressedReason"
        };
        fields.push((key, Value::string(marker.reason.clone())));
    }
    if let Some(diagnostic) = &marker.diagnostic {
        let key = if prefix == "dead" {
            "deadDiagnostic"
        } else {
            "regressedDiagnostic"
        };
        fields.push((key, Value::string(diagnostic.clone())));
    }
}
