//! Reading archived changes for the validator line, tolerating old event lines.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use osq_core::{ChangeState, ChangeStatus, Event, Stream, TaskId, parse_event_line};
use osq_kernel_storage::{ChangeEntry, ChangeSnapshot, EventFacts, TableEvent, read_change};

use super::id;

/// One archived change's snapshot, falling back to its validator events alone.
///
/// Implements: rust-show/status-text-equals-typescript-s
pub(crate) fn read(entry: &ChangeEntry) -> ChangeSnapshot {
    read_change(entry).unwrap_or_else(|_| fallback(entry, validator_events(&entry.path)))
}

/// A snapshot holding only the change stream's readable validator runs.
#[cfg_attr(docsrs, mutants::skip)]
fn fallback(entry: &ChangeEntry, table_events: Vec<TableEvent>) -> ChangeSnapshot {
    ChangeSnapshot {
        id: id(&entry.folder),
        folder: entry.folder.clone(),
        location: entry.location,
        title: None,
        goal: None,
        planner: None,
        approved: false,
        approved_at: None,
        archive_time: None,
        tasks: Vec::new(),
        state: ChangeState::new(std::iter::empty::<TaskId>()),
        status: ChangeStatus::Archived,
        facts: Some(EventFacts {
            started: BTreeMap::new(),
            halts: 0,
            cost: None,
            dead_attempts: Vec::new(),
            archived_at: None,
            table_events,
            outcomes: BTreeMap::new(),
        }),
        plan_records: Vec::new(),
        manifest_notices: None,
        disclosures: Vec::new(),
        deltas: Vec::new(),
        verify: String::new(),
        proposal: false,
        brief: false,
        before_approval: None,
        change_regressed: None,
    }
}

/// The change stream's `validator_ran` events that read, in file order.
fn validator_events(folder: &Path) -> Vec<TableEvent> {
    let path = folder.join(".run").join("events").join("change.jsonl");
    let text = fs::read_to_string(path).unwrap_or_default();
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| parse_event_line(line.trim()).ok())
        .filter(|envelope| matches!(envelope.event, Event::ValidatorRan(_)))
        .map(|envelope| TableEvent {
            stream: Stream::Change,
            timestamp: envelope.timestamp,
            event: envelope.event,
        })
        .collect()
}
