//! The `Recertifications:` section of an archived change.

use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;

use serde_json::Value;

use crate::events::{Event, js_number, read};
use crate::model::Change;

use super::values::{number, text, time, trimmed};

/// One recertification decision, in display order.
struct Row {
    /// The task number the decision names.
    task: String,
    /// The recorded timestamp, when it parses.
    timestamp: Option<String>,
    /// The recorded outcome.
    outcome: Option<String>,
    /// The trimmed verify command.
    verify: Option<String>,
    /// The finite exit code.
    exit_code: Option<f64>,
    /// The recorded timeout flag.
    timed_out: Option<bool>,
    /// Each differing path with its attribution.
    attribution: Vec<(String, String)>,
}

/// A typed recertification event with its stream's task name.
struct Typed {
    /// The stream file's task name.
    stream: String,
    /// The event itself.
    event: Event,
}

/// The `Recertifications:` lines, or none for a change without them.
///
/// Implements: rust-show/show-text
pub(super) fn lines(change: &Change) -> Vec<String> {
    if !change.archived {
        return Vec::new();
    }
    let events = read(change);
    let mut typed = Vec::new();
    for stream in numeric_streams(change) {
        for event in events.for_task(&stream) {
            if event.kind == "recertification" {
                typed.push(Typed {
                    stream: stream.clone(),
                    event: event.clone(),
                });
            }
        }
    }
    let mut rows: Vec<Row> = typed.iter().map(row).collect();
    rows.sort_by(compare_rows);
    if rows.is_empty() {
        return Vec::new();
    }
    let mut lines = vec![String::new(), "Recertifications:".to_owned()];
    for row in &rows {
        lines.extend(row_lines(row));
    }
    lines
}

/// The numbered event streams, in TypeScript's file order.
fn numeric_streams(change: &Change) -> Vec<String> {
    let dir = change.path.join(".run").join("events");
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter_map(|name| name.strip_suffix(".jsonl").map(ToOwned::to_owned))
        .filter(|name| name.bytes().all(|byte| byte.is_ascii_digit()))
        .collect();
    names.sort_by(|left, right| compare_streams(left, right));
    names
}

/// Orders two stream names by their parsed leading number.
fn compare_streams(left: &str, right: &str) -> Ordering {
    match (leading_number(left), leading_number(right)) {
        (Some(left), Some(right)) => left.partial_cmp(&right).unwrap_or(Ordering::Equal),
        _ => left.cmp(right),
    }
}

/// The leading digits of a name, as a number for ordering.
fn leading_number(text: &str) -> Option<f64> {
    let end = text
        .find(|character: char| !character.is_ascii_digit())
        .unwrap_or(text.len());
    text.get(..end).and_then(|digits| digits.parse().ok())
}

/// One typed event's display row.
fn row(typed: &Typed) -> Row {
    let event = &typed.event;
    let differing = path_list(event.field("differingPaths"));
    let recorded = recorded_attribution(event.field("attribution"));
    let mut by_path = BTreeMap::new();
    for (path, attribution) in &recorded {
        by_path
            .entry(path.clone())
            .or_insert_with(|| attribution.clone());
    }
    let mut all_paths: BTreeSet<String> = differing.iter().cloned().collect();
    all_paths.extend(recorded.into_iter().map(|(path, _)| path));
    let attribution = all_paths
        .into_iter()
        .map(|path| {
            let value = by_path
                .get(&path)
                .map_or_else(|| "unknown".to_owned(), Clone::clone);
            (path, value)
        })
        .collect();
    let timestamp = event.timestamp.trim();
    Row {
        task: numeric_task(event).unwrap_or_else(|| typed.stream.clone()),
        timestamp: (!timestamp.is_empty() && time(timestamp).is_some())
            .then(|| timestamp.to_owned()),
        outcome: text(event.field("outcome"))
            .filter(|value| matches!(*value, "passed" | "requeued"))
            .map(ToOwned::to_owned),
        verify: trimmed(event.field("command")),
        exit_code: number(event.field("exitCode")),
        timed_out: event.field("timedOut").and_then(Value::as_bool),
        attribution,
    }
}

/// The stripped differing paths, sorted and unique.
fn path_list(value: Option<&Value>) -> Vec<String> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    let mut paths: Vec<String> = items
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(ToOwned::to_owned)
        .collect();
    paths.sort();
    paths.dedup();
    paths
}

/// The recorded attribution entries with their trimmed paths and labels.
fn recorded_attribution(value: Option<&Value>) -> Vec<(String, String)> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    items.iter().filter_map(attribution_entry).collect()
}

/// One attribution entry, or none when it has no usable path.
fn attribution_entry(value: &Value) -> Option<(String, String)> {
    let object = value.as_object()?;
    let path = object.get("path")?.as_str()?.trim();
    if path.is_empty() {
        return None;
    }
    let attribution = match object.get("attribution") {
        Some(Value::String(text)) if !text.trim().is_empty() => text.trim().to_owned(),
        Some(Value::Number(number)) => js_number(number.as_f64().unwrap_or_default()),
        _ => "unknown".to_owned(),
    };
    Some((path.to_owned(), attribution))
}

/// The task number the event's data names, or none.
fn numeric_task(event: &Event) -> Option<String> {
    let value = event.field("task")?;
    if let Some(number) = value.as_f64() {
        if number >= 0.0 && number.fract() == 0.0 {
            return Some(js_number(number));
        }
    }
    let text = value.as_str()?.trim();
    (!text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit())).then(|| text.to_owned())
}

/// Orders rows by timestamp, then task number, preserving collection order.
fn compare_rows(left: &Row, right: &Row) -> Ordering {
    let left_time = left.timestamp.as_deref().and_then(time);
    let right_time = right.timestamp.as_deref().and_then(time);
    if let (Some(left_time), Some(right_time)) = (left_time, right_time) {
        if left_time != right_time {
            return left_time.cmp(&right_time);
        }
    }
    if let (Some(left_task), Some(right_task)) =
        (leading_number(&left.task), leading_number(&right.task))
    {
        if left_task.partial_cmp(&right_task) != Some(Ordering::Equal) {
            return left_task
                .partial_cmp(&right_task)
                .unwrap_or(Ordering::Equal);
        }
    }
    Ordering::Equal
}

/// Every line of one recertification row.
fn row_lines(row: &Row) -> Vec<String> {
    let label = match row.outcome.as_deref() {
        Some("passed") => "recertified",
        Some("requeued") => "requeued for agent work",
        _ => "unavailable",
    };
    let timestamp = row.timestamp.as_deref().unwrap_or("unavailable");
    let verify = row.verify.as_deref().unwrap_or("unavailable");
    let exit = row
        .exit_code
        .map_or_else(|| "unavailable".to_owned(), js_number);
    let timed_out = match row.timed_out {
        Some(true) => "yes",
        Some(false) => "no",
        None => "unavailable",
    };
    let mut lines = vec![
        format!("  Task {} {timestamp} [{label}]", row.task),
        format!("      Verify: {verify}"),
        format!("      Exit code: {exit}"),
        format!("      Timed out: {timed_out}"),
    ];
    if !row.attribution.is_empty() {
        lines.push("      Differing paths:".to_owned());
        for (path, attribution) in &row.attribution {
            let label = if matches!(attribution.as_str(), "ambiguous" | "unknown") {
                attribution.clone()
            } else {
                format!("attributed to task {attribution}")
            };
            lines.push(format!("        - {path} — {label}"));
        }
    }
    lines
}
