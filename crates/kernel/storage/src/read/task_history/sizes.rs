//! Measuring one change folder's task streams as TypeScript's report does.
//!
//! Implements: rust-storage/task-sizes

use std::cmp::Ordering;
use std::fs;
use std::path::Path;

use osq_kernel_specs::parse_task_file;
use serde_json::Value;

use super::stream::{self, Event};

/// The scope-file resolver generation that measured a task.
///
/// Implements: rust-storage/task-sizes
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScopeResolver {
    /// A stream without a `scopeResolver` member.
    Legacy,
    /// A stream whose `scopeResolver` is the number 2.
    Second,
    /// A stream with any other `scopeResolver`, including `null`.
    Other,
}

/// One measured task of a change folder.
///
/// Implements: rust-storage/task-sizes
#[derive(Clone, Debug, PartialEq)]
pub struct TaskSize {
    /// The task id, from its `tasks/<task>.md` name.
    pub task: String,
    /// The task file's title, or empty text without one.
    pub title: String,
    /// The number of the task file's acceptance items.
    pub acceptance_lines: usize,
    /// The task's scope files, from its last end measure or its first start.
    pub scope_files: f64,
    /// The resolver generation of the task's first start measure.
    pub resolver: ScopeResolver,
    /// The number of `started` events.
    pub attempts: u64,
    /// Whether the first attempt reached a `done` event.
    pub first_attempt_pass: bool,
    /// The summed measures start-to-end durations, or `None` without one.
    pub duration_ms: Option<i64>,
}

/// Reads one change folder's measured tasks, ordered by their task ids.
///
/// Implements: rust-storage/task-sizes
#[must_use]
pub fn read_task_sizes(folder: &Path) -> Vec<TaskSize> {
    let dir = folder.join("tasks");
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.strip_suffix(".md").is_some())
        .collect();
    names.sort_by(|left, right| compare_names(left, right));
    names
        .into_iter()
        .filter_map(|name| task_size(folder, &name))
        .collect()
}

/// One task file's measured size, or `None` without a readable measured stream.
fn task_size(folder: &Path, file_name: &str) -> Option<TaskSize> {
    let task = file_name.strip_suffix(".md")?;
    let path = folder
        .join(".run")
        .join("events")
        .join(format!("{task}.jsonl"));
    let content = fs::read_to_string(path).ok()?;
    let events = stream::parse(&content);
    let start = events
        .iter()
        .find(|event| start_scope_files(event).is_some())?;
    let start_scope_files = start_scope_files(start)?;
    let (title, acceptance_lines) = metadata(folder, task);
    let (attempts, first_attempt_pass) = observe_attempts(&events);
    Some(TaskSize {
        task: task.to_owned(),
        title,
        acceptance_lines,
        scope_files: measured_scope_files(&events, start_scope_files),
        resolver: resolver(start),
        attempts,
        first_attempt_pass,
        duration_ms: duration_ms(&events),
    })
}

/// The finite, non-negative `scopeFiles` of one start measure, or `None`.
fn start_scope_files(event: &Event) -> Option<f64> {
    if event.kind() != Some("measures") || event.text("phase") != Some("start") {
        return None;
    }
    event.number("scopeFiles").filter(|files| *files >= 0.0)
}

/// The resolver generation of one start measure's data.
fn resolver(event: &Event) -> ScopeResolver {
    match event.raw("scopeResolver") {
        None => ScopeResolver::Legacy,
        Some(Value::Number(number)) if number.as_f64() == Some(2.0) => ScopeResolver::Second,
        Some(_) => ScopeResolver::Other,
    }
}

/// The last end measure's scope hash count, else the start measure's size.
fn measured_scope_files(events: &[Event], start_scope_files: f64) -> f64 {
    for event in events.iter().rev() {
        if event.kind() != Some("measures") || event.text("phase") != Some("end") {
            continue;
        }
        if let Some(Value::Object(hashes)) = event.raw("scopeHashes") {
            let count = u32::try_from(hashes.len()).unwrap_or(u32::MAX);
            return f64::from(count);
        }
    }
    start_scope_files
}

/// The attempt count and whether the first attempt reached `done`.
fn observe_attempts(events: &[Event]) -> (u64, bool) {
    let mut attempts = 0;
    let mut first_attempt_active = false;
    let mut first_attempt_resolved = false;
    let mut first_attempt_pass = false;
    for event in events {
        match event.kind() {
            Some("started") => {
                attempts += 1;
                if first_attempt_active {
                    first_attempt_resolved = true;
                    first_attempt_active = false;
                } else if !first_attempt_resolved {
                    first_attempt_active = true;
                }
            }
            Some("done") => {
                if first_attempt_active && !first_attempt_resolved {
                    first_attempt_pass = true;
                    first_attempt_resolved = true;
                    first_attempt_active = false;
                }
            }
            Some("dead" | "regressed") if first_attempt_active && !first_attempt_resolved => {
                first_attempt_resolved = true;
                first_attempt_active = false;
            }
            _ => {}
        }
    }
    (attempts, first_attempt_pass)
}

/// The summed measures start-to-end durations, or `None` without a pair.
fn duration_ms(events: &[Event]) -> Option<i64> {
    let mut open_start = None;
    let mut total = 0;
    let mut measured = false;
    for event in events {
        if event.kind() != Some("measures") {
            continue;
        }
        match event.text("phase") {
            Some("start") => open_start = event.timestamp_ms(),
            Some("end") => {
                if let (Some(start), Some(end)) = (open_start, event.timestamp_ms())
                    && end >= start
                {
                    total += end - start;
                    measured = true;
                }
                open_start = None;
            }
            _ => {}
        }
    }
    measured.then_some(total)
}

/// A task file's title and acceptance count, empty and 0 without a parse.
fn metadata(folder: &Path, task: &str) -> (String, usize) {
    let path = folder.join("tasks").join(format!("{task}.md"));
    let Ok(text) = fs::read_to_string(path) else {
        return (String::new(), 0);
    };
    match parse_task_file(&text) {
        Ok(file) => (file.title, file.acceptance.len()),
        Err(_) => (String::new(), 0),
    }
}

/// Orders two names by leading number when both have one, else by bytes.
fn compare_names(left: &str, right: &str) -> Ordering {
    match (leading_number(left), leading_number(right)) {
        (Some(a), Some(b)) => a.cmp(&b).then_with(|| left.cmp(right)),
        _ => left.cmp(right),
    }
}

/// The number a name leads with, or `None` when it leads with no digit.
fn leading_number(name: &str) -> Option<u128> {
    let digits: String = name.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}
