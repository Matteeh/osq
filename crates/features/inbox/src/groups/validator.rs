//! The one validator-failing item of the archived changes.

use osq_core::event::ValidatorOutcome;
use osq_kernel_storage::{ChangeSnapshot, Location, timestamp_ms};

use super::change_id;
use crate::needs::Item;

/// The latest validator run, when it failed.
pub(crate) fn item(snapshots: &[ChangeSnapshot]) -> Option<Item> {
    let mut runs = Vec::new();
    for snapshot in snapshots {
        if snapshot.location != Location::Archived {
            continue;
        }
        let Some(facts) = &snapshot.facts else {
            continue;
        };
        for event in &facts.table_events {
            let osq_core::Event::ValidatorRan(data) = &event.event else {
                continue;
            };
            if data.outcome == ValidatorOutcome::NotRun {
                continue;
            }
            runs.push(Run {
                snapshot,
                time: timestamp_ms(&event.timestamp).unwrap_or(0),
                outcome: data.outcome,
                output: data.output.as_deref(),
            });
        }
    }
    runs.sort_by_key(|run| run.time);
    let latest = runs.last()?;
    if !failing(latest.outcome) {
        return None;
    }
    let count = runs
        .iter()
        .rev()
        .take_while(|run| failing(run.outcome))
        .count();
    let outcome = latest.outcome.as_str();
    let error = first_line(latest.output).unwrap_or_else(|| outcome.to_owned());
    let snapshot = latest.snapshot;
    let id = change_id(snapshot);
    let title = snapshot
        .title
        .clone()
        .unwrap_or_else(|| snapshot.folder.clone());
    Some(Item {
        line: format!(
            "  {id}: {title} — validator {outcome} {count}× in a row: {error} — osq show {id}"
        ),
        id,
    })
}

/// One validator run of an archived change.
struct Run<'a> {
    /// The change the run belongs to.
    snapshot: &'a ChangeSnapshot,
    /// The run's epoch milliseconds, 0 when its timestamp does not read.
    time: i64,
    /// The run's outcome.
    outcome: ValidatorOutcome,
    /// The run's output, when it reported one.
    output: Option<&'a str>,
}

/// Whether an outcome keeps the failing line up.
fn failing(outcome: ValidatorOutcome) -> bool {
    matches!(
        outcome,
        ValidatorOutcome::Failed | ValidatorOutcome::TimedOut | ValidatorOutcome::Unreadable
    )
}

/// The first non-blank line of an output, trimmed.
fn first_line(output: Option<&str>) -> Option<String> {
    output?
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}
