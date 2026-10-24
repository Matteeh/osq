//! The inbox object's members, in TypeScript's order.

use super::Json;
use crate::groups::{landed, running};
use crate::needs::{AutopilotFacts, Item, Kind, TaskRef, ValidatorFacts};

/// The whole inbox as `JSON.stringify(inbox, null, 2)` writes it.
///
/// Implements: rust-inbox/inbox-json
pub(crate) fn inbox(
    needs_you: &[Item],
    running: &[running::Item],
    landed: &[landed::Item],
) -> String {
    Json::Object(vec![
        (
            "needsYou",
            Json::Array(needs_you.iter().map(needs_item).collect()),
        ),
        (
            "running",
            Json::Array(running.iter().map(running_item).collect()),
        ),
        (
            "landed",
            Json::Array(landed.iter().map(landed_item).collect()),
        ),
    ])
    .render()
}

/// One needs-you item's JSON object.
fn needs_item(item: &Item) -> Json {
    let mut members = vec![
        ("kind", Json::String(item.kind.name().to_owned())),
        ("change", change(&item.id, &item.title)),
        ("task", task(item.task.as_ref())),
        ("command", Json::String(item.command.clone())),
    ];
    if item.kind.before_approval() {
        members.push(("beforeApproval", Json::Bool(true)));
    }
    if let Some(fingerprint) = &item.stuck {
        members.push((
            "stuck",
            Json::Object(vec![("fingerprint", Json::String(fingerprint.clone()))]),
        ));
    }
    if let Some(trigger) = &item.steering {
        members.push((
            "steering",
            Json::Object(vec![
                ("trigger", Json::String(trigger.name().to_owned())),
                ("reason", Json::String(trigger.reason.clone())),
            ]),
        ));
    }
    if let Some(need) = &item.need {
        members.push((
            "blocked",
            Json::Object(vec![("need", Json::String(need.clone()))]),
        ));
    }
    match &item.kind {
        Kind::ValidatorFailing(facts) => {
            members.push(("validatorFailing", validator_failing(facts)));
        }
        Kind::AutopilotStopped(facts) => {
            members.push(("autopilotStopped", autopilot_stopped(facts)));
        }
        _ => {}
    }
    Json::Object(members)
}

/// One running or paused item's JSON object.
fn running_item(item: &running::Item) -> Json {
    let mut members = vec![
        ("change", change(&item.id, &item.title)),
        ("task", task(Some(&item.task))),
    ];
    match &item.state {
        running::State::Running {
            pid,
            started_at_ms,
            elapsed_seconds,
        } => {
            members.push(("pid", Json::Number(pid.to_string())));
            members.push((
                "startedAt",
                Json::String(crate::cursor::format_utc(*started_at_ms)),
            ));
            members.push(("elapsedSeconds", Json::Number(elapsed_seconds.to_string())));
        }
        running::State::Paused { until } => {
            members.push(("pausedUntil", Json::String(until.clone())));
        }
    }
    members.push(("command", Json::String(format!("osq show {}", item.id))));
    Json::Object(members)
}

/// One landed item's JSON object.
fn landed_item(item: &landed::Item) -> Json {
    let mut members = vec![
        ("change", change(&item.id, &item.title)),
        ("archivedAt", Json::String(item.archived_at.clone())),
        ("command", Json::String(format!("osq show {}", item.id))),
    ];
    if let Some(counts) = item.disclosures {
        members.push((
            "disclosures",
            Json::Object(vec![
                ("deviated", Json::Number(counts.deviated.to_string())),
                (
                    "missingContext",
                    Json::Number(counts.missing_context.to_string()),
                ),
                (
                    "outsideScope",
                    Json::Number(counts.outside_scope.to_string()),
                ),
            ]),
        ));
    }
    Json::Object(members)
}

/// A change reference object.
fn change(id: &str, title: &str) -> Json {
    Json::Object(vec![
        ("id", Json::String(id.to_owned())),
        ("title", Json::String(title.to_owned())),
    ])
}

/// A task reference object, or `null` for a change-level item.
fn task(task: Option<&TaskRef>) -> Json {
    let Some(task) = task else {
        return Json::Null;
    };
    Json::Object(vec![
        ("number", Json::String(task.number.clone())),
        ("title", Json::String(task.title.clone())),
    ])
}

/// A validator-failing item's facts object.
fn validator_failing(facts: &ValidatorFacts) -> Json {
    Json::Object(vec![
        ("outcome", Json::String(facts.outcome.clone())),
        ("runs", Json::Number(facts.runs.to_string())),
        ("error", Json::String(facts.error.clone())),
    ])
}

/// An autopilot-stopped item's facts object.
fn autopilot_stopped(facts: &AutopilotFacts) -> Json {
    Json::Object(vec![
        ("reason", Json::String(facts.reason.clone())),
        ("item", Json::String(facts.item.clone())),
        ("change", optional(facts.change.as_ref())),
        ("detail", optional(facts.detail.as_ref())),
    ])
}

/// A string or `null` for an absent value.
fn optional(value: Option<&String>) -> Json {
    value.map_or(Json::Null, |text| Json::String(text.clone()))
}
