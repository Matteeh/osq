//! Reading every `.run/events/*.jsonl` stream of one change.

use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::fs;

use crate::model::Change;

use super::model::{Event, parse};

/// Every event stream of one change, in TypeScript's timeline order.
#[derive(Debug, Default)]
pub(crate) struct Events {
    /// The chronological timeline the `Event Timeline:` section prints.
    pub(crate) timeline: Vec<Event>,
    /// Each task stream's events, keyed by its file's task name.
    streams: BTreeMap<String, Vec<Event>>,
}

impl Events {
    /// The events of one task's own stream, or none without that stream.
    pub(crate) fn for_task(&self, task_number: &str) -> &[Event] {
        self.streams.get(task_number).map_or(&[], Vec::as_slice)
    }
}

/// Reads every `.run/events/*.jsonl` stream of a change.
pub(crate) fn read(change: &Change) -> Events {
    let dir = change.path.join(".run").join("events");
    let Ok(entries) = fs::read_dir(&dir) else {
        return Events::default();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| {
            name.rsplit_once('.')
                .is_some_and(|(_, extension)| extension == "jsonl")
        })
        .collect();
    names.sort_by(|left, right| compare_files(left, right));

    let mut events = Events::default();
    for name in names {
        let task_number = name
            .strip_suffix(".jsonl")
            .map_or_else(|| name.clone(), ToOwned::to_owned);
        let Ok(text) = fs::read_to_string(dir.join(&name)) else {
            continue;
        };
        let mut stream = Vec::new();
        for line in text.split('\n') {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let Some(event) = parse(trimmed, &task_number) else {
                continue;
            };
            stream.push(event.clone());
            events.timeline.push(event);
        }
        events.streams.insert(task_number, stream);
    }
    events.timeline.sort_by(compare_events);
    events
}

/// Orders event files by their leading number, then by name.
fn compare_files(left: &str, right: &str) -> Ordering {
    match (leading_number(left), leading_number(right)) {
        (Some(left_number), Some(right_number)) => left_number.cmp(&right_number),
        _ => left.cmp(right),
    }
}

/// The number an event file's name leads with.
fn leading_number(name: &str) -> Option<u64> {
    let digits: String = name.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// Orders events by their timestamp text, which for the fixed osq form is
/// also chronological.
fn compare_events(left: &Event, right: &Event) -> Ordering {
    left.timestamp.cmp(&right.timestamp)
}
