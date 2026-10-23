//! TypeScript's commit message and the trailers of a task's started events.

use std::fs;
use std::path::Path;

use osq_core::event::{Event, StartedData, parse_event_line};
use osq_kernel_storage::timestamp_ms;

use super::time;

/// One trailer line of a task commit's message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Trailer {
    /// The trailer's key, such as `Osq-Change`.
    pub(crate) key: &'static str,
    /// The trailer's value.
    pub(crate) value: String,
}

/// The change folder's leading digits, or its whole name without any.
///
/// Implements: rust-run/task-commit-message
pub(crate) fn change_id(folder: &str) -> String {
    let digits: String = folder.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        folder.to_owned()
    } else {
        digits
    }
}

/// Assembles a commit message: subject, blank line, title, outcome line, blank
/// line, every trailer, and a final newline.
///
/// Implements: rust-run/task-commit-message
pub(crate) fn format(
    subject: &str,
    title: &str,
    outcome_line: &str,
    trailers: &[Trailer],
) -> String {
    let mut lines = vec![
        subject.to_owned(),
        String::new(),
        title.to_owned(),
        outcome_line.to_owned(),
        String::new(),
    ];
    for trailer in trailers {
        lines.push(format!("{}: {}", trailer.key, trailer.value));
    }
    lines.push(String::new());
    lines.join("\n")
}

/// The `Osq-Change` and `Osq-Task` trailers, plus `Osq-Model` and
/// `Osq-Version` from the task's last complete `started` event.
///
/// Implements: rust-run/task-commit-message
pub(crate) fn read_trailers(change: &Path, task: &str) -> Vec<Trailer> {
    let folder = change
        .file_name()
        .map_or_else(String::new, |name| name.to_string_lossy().into_owned());
    let mut trailers = vec![
        Trailer {
            key: "Osq-Change",
            value: folder,
        },
        Trailer {
            key: "Osq-Task",
            value: task.to_owned(),
        },
    ];
    let Some(started) = last_started(change, task) else {
        return trailers;
    };
    let (Some(harness), Some(model), Some(version)) =
        (started.harness, started.model, started.osq_version)
    else {
        return trailers;
    };
    trailers.push(Trailer {
        key: "Osq-Model",
        value: format!("{harness} {model}"),
    });
    trailers.push(Trailer {
        key: "Osq-Version",
        value: version,
    });
    trailers
}

/// Whole seconds from the task's last `started` event to now, never below 0
/// and 0 without one.
///
/// Implements: rust-run/task-commit-message
pub(crate) fn elapsed_seconds(change: &Path, task: &str) -> i64 {
    let latest = started_events(change, task)
        .into_iter()
        .filter_map(|(timestamp, _)| timestamp_ms(&timestamp))
        .next_back();
    let Some(started) = latest else {
        return 0;
    };
    (time::now_ms() - started).div_euclid(1000).max(0)
}

/// The task's last `started` event whose data holds all three trailer fields.
fn last_started(change: &Path, task: &str) -> Option<StartedData> {
    started_events(change, task)
        .into_iter()
        .filter_map(|(_, event)| match event {
            Event::Started(data)
                if data.harness.is_some() && data.model.is_some() && data.osq_version.is_some() =>
            {
                Some(data)
            }
            _ => None,
        })
        .next_back()
}

/// Every readable `started` event with its timestamp, in file order.
fn started_events(change: &Path, task: &str) -> Vec<(String, Event)> {
    let path = change
        .join(".run")
        .join("events")
        .join(format!("{task}.jsonl"));
    let Ok(content) = fs::read_to_string(path) else {
        return Vec::new();
    };
    content
        .lines()
        .filter_map(|line| parse_event_line(line.trim()).ok())
        .filter(|envelope| matches!(envelope.event, Event::Started(_)))
        .map(|envelope| (envelope.timestamp, envelope.event))
        .collect()
}
