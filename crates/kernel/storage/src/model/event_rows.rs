//! Mapping kept task-stream events to the `pauses` and `recertifications` rows.
//!
//! Pure leaves: they take a snapshot and give back row structs, with no disk or
//! SQLite access (ADR 023).

use serde_json::{Map, Value};

use osq_core::Event;

use crate::read::ChangeSnapshot;

use super::rows::{flag, is_task_number, string_of, table_events};

/// One row of the `pauses` table.
pub(super) struct PauseRow {
    /// The change folder.
    pub(super) change: String,
    /// The paused task.
    pub(super) task: String,
    /// The event's timestamp.
    pub(super) paused_at: String,
    /// The time the pause lasts until.
    pub(super) until: String,
    /// Where the reset time came from.
    pub(super) source: String,
}

/// One row of the `recertifications` table.
pub(super) struct RecertificationRow {
    /// The change folder.
    pub(super) change: String,
    /// The recertified task.
    pub(super) task: String,
    /// The event's timestamp.
    pub(super) recertified_at: String,
    /// The event's outcome.
    pub(super) outcome: String,
    /// 1 when the watcher recertified on its own, else 0.
    pub(super) automatic: i64,
    /// The entry's path, or null.
    pub(super) path: Option<String>,
    /// The entry's attribution, or null.
    pub(super) credited_to: Option<String>,
    /// `measures`, `file_changed` or null.
    pub(super) source: Option<String>,
}

/// Maps every kept `paused` event to a `pauses` row, in fold order.
pub(super) fn pause_rows(snapshot: &ChangeSnapshot) -> Vec<PauseRow> {
    table_events(snapshot)
        .iter()
        .filter_map(|event| match &event.event {
            Event::Paused(data) => Some(PauseRow {
                change: snapshot.folder.clone(),
                task: data.task.clone(),
                paused_at: event.timestamp.clone(),
                until: data.until.clone(),
                source: data.source.clone(),
            }),
            _ => None,
        })
        .collect()
}

/// Maps every attribution entry of every kept `recertification` event, in order.
pub(super) fn recertification_rows(snapshot: &ChangeSnapshot) -> Vec<RecertificationRow> {
    let mut rows = Vec::new();
    for event in table_events(snapshot) {
        let Event::Recertification(data) = &event.event else {
            continue;
        };
        let Some(entries) = data.attribution.as_array() else {
            continue;
        };
        for entry in entries.iter().filter_map(Value::as_object) {
            rows.push(RecertificationRow {
                change: snapshot.folder.clone(),
                task: data.task.clone(),
                recertified_at: event.timestamp.clone(),
                outcome: data.outcome.clone(),
                automatic: flag(data.automatic == Some(true)),
                path: string_of(entry.get("path")),
                credited_to: string_of(entry.get("attribution")),
                source: entry_source(entry),
            });
        }
    }
    rows
}

/// The `source` of one attribution entry.
///
/// `measures` when the entry says so, else `file_changed` when its attribution
/// is a task number, else null.
fn entry_source(entry: &Map<String, Value>) -> Option<String> {
    if entry.get("source").and_then(Value::as_str) == Some("measures") {
        return Some(String::from("measures"));
    }
    entry
        .get("attribution")
        .and_then(Value::as_str)
        .filter(|value| is_task_number(value))
        .map(|_| String::from("file_changed"))
}
