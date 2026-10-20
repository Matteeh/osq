//! Mapping one change snapshot to the read model's rows, without touching disk.

use crate::read::ChangeSnapshot;
use crate::read::TableEvent;
use crate::read::timestamp_ms;

/// One row of the `changes` table.
pub(super) struct ChangeRow {
    /// The folder's leading digits.
    pub(super) id: String,
    /// The folder name.
    pub(super) folder: String,
    /// The proposal title, trimmed, or null.
    pub(super) title: Option<String>,
    /// The archive day, or null without an archive timestamp.
    pub(super) archived_on: Option<String>,
    /// The proposal Goal, trimmed, or null.
    pub(super) goal: Option<String>,
    /// The number of task files.
    pub(super) tasks: i64,
    /// The `started` events of every task stream, or null without events.
    pub(super) attempts: Option<i64>,
    /// The manual `retry` events, or null without events.
    pub(super) halts: Option<i64>,
    /// The approved-to-archived seconds, or null when either end is missing.
    pub(super) elapsed_seconds: Option<i64>,
    /// The summed `tokens` cost, or null when none reported one.
    pub(super) cost: Option<f64>,
    /// The planner, trimmed, or null.
    pub(super) planner: Option<String>,
}

/// One row of the `tasks` table.
pub(super) struct TaskRow {
    /// The change folder.
    pub(super) change: String,
    /// The task id.
    pub(super) task: String,
    /// The task title, or empty text.
    pub(super) title: String,
    /// The `started` events of the task's stream, 0 without one.
    pub(super) attempts: i64,
    /// 1 when the done marker exists, else 0.
    pub(super) done: i64,
}

/// One row of the `dead_attempts` table.
pub(super) struct DeadRow {
    /// The change folder.
    pub(super) change: String,
    /// The dead event's task.
    pub(super) task: String,
    /// The dead event's reason.
    pub(super) reason: String,
}

/// Maps one snapshot to its `changes` row.
pub(super) fn change_row(snapshot: &ChangeSnapshot) -> ChangeRow {
    let facts = snapshot.facts.as_ref();
    ChangeRow {
        id: snapshot.id.clone(),
        folder: snapshot.folder.clone(),
        title: snapshot.title.clone(),
        archived_on: archived_on(snapshot.archive_time.as_deref()),
        goal: snapshot.goal.clone(),
        tasks: len_i64(snapshot.tasks.len()),
        attempts: facts.map(|facts| count_i64(facts.started.values().copied().sum())),
        halts: facts.map(|facts| count_i64(facts.halts)),
        elapsed_seconds: elapsed_seconds(snapshot),
        cost: facts.and_then(|facts| facts.cost),
        planner: snapshot.planner.clone(),
    }
}

/// Maps one snapshot to its `tasks` rows, in task order.
pub(super) fn task_rows(snapshot: &ChangeSnapshot) -> Vec<TaskRow> {
    snapshot
        .tasks
        .iter()
        .map(|task| TaskRow {
            change: snapshot.folder.clone(),
            task: task.id.as_str().to_owned(),
            title: task.title.clone(),
            attempts: count_i64(task.started),
            done: i64::from(task.done),
        })
        .collect()
}

/// Maps one snapshot to its `dead_attempts` rows, in task and file order.
pub(super) fn dead_rows(snapshot: &ChangeSnapshot) -> Vec<DeadRow> {
    snapshot
        .facts
        .as_ref()
        .map(|facts| {
            facts
                .dead_attempts
                .iter()
                .map(|dead| DeadRow {
                    change: snapshot.folder.clone(),
                    task: dead.task.clone(),
                    reason: dead.reason.as_str().to_owned(),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The UTC day of an archive timestamp, or null without one.
fn archived_on(archive_time: Option<&str>) -> Option<String> {
    archive_time?.get(..10).map(ToOwned::to_owned)
}

/// The milliseconds from approval to archive, rounded half up to seconds.
fn elapsed_seconds(snapshot: &ChangeSnapshot) -> Option<i64> {
    if !snapshot.approved {
        return None;
    }
    let start = timestamp_ms(snapshot.approved_at.as_deref()?)?;
    let end = timestamp_ms(snapshot.archive_time.as_deref()?)?;
    let difference = end - start;
    (difference >= 0).then(|| (difference + 500) / 1000)
}

/// Converts an unsigned count to the column's integer, saturating.
pub(super) fn count_i64(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

/// Converts a slice length to the column's integer, saturating.
pub(super) fn len_i64(value: usize) -> i64 {
    count_i64(u64::try_from(value).unwrap_or(u64::MAX))
}

/// The kept table events of a snapshot, or an empty slice without events.
pub(super) fn table_events(snapshot: &ChangeSnapshot) -> &[TableEvent] {
    snapshot
        .facts
        .as_ref()
        .map_or(&[], |facts| facts.table_events.as_slice())
}

/// A JSON value as a string, or `None` when it is of another kind.
pub(super) fn string_of(value: Option<&serde_json::Value>) -> Option<String> {
    value.and_then(serde_json::Value::as_str).map(str::to_owned)
}

/// Whether a text is a task number: one or more ASCII digits.
pub(super) fn is_task_number(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

/// A JSON number as `f64`, or `0.0` when it is out of range.
pub(super) fn number_f64(number: &serde_json::Number) -> f64 {
    number.as_f64().unwrap_or_default()
}

/// The integer a boolean column holds: 1 when true, else 0.
pub(super) fn flag(value: bool) -> i64 {
    i64::from(value)
}
