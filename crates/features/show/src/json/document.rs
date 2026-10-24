//! Building TypeScript's `osq show --json` document from the show model.

use std::path::Path;

use osq_kernel_storage::Location;

use crate::events::{Events, read};
use crate::facts::LandFacts;
use crate::model::Change;

use super::value::{self, Value};
use super::{digest, event, land, planning, tasks, verification};

/// One change's JSON text, without the final newline.
/// Implements: rust-show/show-json
pub(crate) fn build(change: &Change, land: Option<&LandFacts>) -> String {
    let events = read(change);
    let mut fields = head(change);
    fields.push(("tasks", tasks::array(change, &events)));
    fields.push(("planningSessions", planning::sessions(change)));
    fields.push(("recertifications", recertified(change)));
    fields.push(("timeline", event::array(&events.timeline)));
    fields.extend(tail(change, land, &events));
    fields.push(("digest", digest::value(change)));
    value::render(&Value::object(fields))
}

/// The members before the task list.
/// Implements: rust-show/show-json
fn head(change: &Change) -> Vec<(&'static str, Value)> {
    vec![
        ("id", Value::string(change.id.clone())),
        ("folderName", Value::string(change.folder.clone())),
        ("folderPath", path(&change.path)),
        ("isArchived", Value::Bool(change.archived)),
        ("location", Value::string(location(change.location))),
        ("title", Value::string(change.title.clone())),
        ("status", Value::string(change.status.as_str())),
        ("approvedHash", optional(change.approved_hash.as_deref())),
        ("dependsOn", Value::strings(&change.depends_on)),
        (
            "features",
            Value::object(vec![
                ("reads", Value::strings(&change.reads)),
                ("writes", Value::strings(&change.writes)),
            ]),
        ),
        ("goal", Value::string(change.goal.clone())),
        ("contract", Value::string(change.contract.clone())),
        ("nonGoals", Value::string(change.non_goals.clone())),
        ("delta", Value::string(change.delta.clone())),
    ]
}

/// The members after the timeline.
/// Implements: rust-show/show-json
fn tail(change: &Change, facts: Option<&LandFacts>, events: &Events) -> Vec<(&'static str, Value)> {
    let mut fields = Vec::new();
    if let Some(next) = &change.next {
        fields.push((
            "next",
            Value::object(vec![
                ("state", Value::string(next.state())),
                ("command", optional(next.command())),
                ("detail", optional(next.detail())),
            ]),
        ));
    }
    if let Some(after) = &change.after_landing {
        fields.push(("afterLanding", Value::string(after.clone())));
    }
    if !change.archived {
        return fields;
    }
    if let Some(event) = crate::archived::validation_event(&events.timeline)
        && let Some(data) = event::data(event)
    {
        fields.push(("validation", data));
    }
    if let Some(view) = crate::archived::land_view(change, facts, &events.timeline) {
        fields.push(("land", land::value(&view)));
    }
    if let Some(history) = crate::archived::verification_history(&events.timeline) {
        fields.push(("verification", verification::value(&history)));
    }
    fields
}

/// The recertification rows of one change.
/// Implements: rust-show/show-json
fn recertified(change: &Change) -> Value {
    Value::Array(
        crate::archived::recertification_rows(change)
            .iter()
            .map(planning::recertification)
            .collect(),
    )
}

/// A string value for an optional string, or `null`.
/// Implements: rust-show/show-json
fn optional(value: Option<&str>) -> Value {
    value.map_or(Value::Null, Value::string)
}

/// The path as TypeScript prints it.
/// Implements: rust-show/show-json
fn path(path: &Path) -> Value {
    Value::string(path.to_string_lossy().into_owned())
}

/// The location word TypeScript prints.
/// Implements: rust-show/show-json
fn location(location: Location) -> &'static str {
    match location {
        Location::Active => "active",
        Location::Archived => "archived",
        Location::Rejected => "rejected",
    }
}

/// The lowercase status word one task or change prints.
/// Implements: rust-show/show-json
pub(super) fn task_status(status: osq_core::TaskStatus) -> &'static str {
    match status {
        osq_core::TaskStatus::Pending => "pending",
        osq_core::TaskStatus::Running => "running",
        osq_core::TaskStatus::Done => "done",
        osq_core::TaskStatus::Dead => "dead",
        osq_core::TaskStatus::Regressed => "regressed",
    }
}
