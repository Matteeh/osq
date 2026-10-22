//! The `Mutation:` and `Survived:` lines of one task.

use serde_json::Value;

use crate::events::{Event, js_number};

use super::values;

/// The mutation lines after the last measures start, or `None` without one.
pub(super) fn lines(events: &[Event]) -> Vec<String> {
    let last_start = events.iter().rposition(|event| {
        event.kind == "measures" && values::text(values::field(event, "phase")) == Some("start")
    });
    let begin = last_start
        .and_then(|index| index.checked_add(1))
        .unwrap_or(0);
    let mut entries = Vec::new();
    let mut survivors = Vec::new();
    for event in &events[begin..] {
        if event.kind != "mutation_ran" {
            continue;
        }
        let Some(file) = values::trimmed(values::field(event, "file")) else {
            continue;
        };
        let Some(function) = values::trimmed(values::field(event, "function")) else {
            continue;
        };
        if values::text(values::field(event, "outcome")) == Some("measured") {
            let killed = values::number(values::field(event, "killed")).unwrap_or(0.0);
            let survived = values::number(values::field(event, "survived")).unwrap_or(0.0);
            entries.push(format!(
                "{file}#{function} {} of {} killed",
                js_number(killed),
                js_number(killed + survived)
            ));
        } else {
            let reason = values::trimmed(values::field(event, "reason"))
                .unwrap_or_else(|| "unavailable".to_owned());
            entries.push(format!("{file}#{function} not measured ({reason})"));
        }
        survivors.extend(survivor_lines(values::field(event, "survivors"), &file));
    }
    if entries.is_empty() {
        return Vec::new();
    }
    let mut lines = vec![format!("      Mutation: {}", entries.join("; "))];
    lines.extend(survivors);
    lines
}

/// One `Survived:` line per valid survivor of a mutation event.
fn survivor_lines(value: Option<&Value>, fallback_file: &str) -> Vec<String> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    let mut lines = Vec::new();
    for item in items {
        let Value::Object(fields) = item else {
            continue;
        };
        let (Some(line), Some(column), Some(mutator), Some(replacement)) = (
            values::number(fields.get("line")),
            values::number(fields.get("column")),
            fields.get("mutator").and_then(Value::as_str),
            fields.get("replacement").and_then(Value::as_str),
        ) else {
            continue;
        };
        let file = values::trimmed(fields.get("file")).unwrap_or_else(|| fallback_file.to_owned());
        lines.push(format!(
            "        Survived: {file}:{}:{} {mutator} -> {replacement}",
            js_number(line),
            js_number(column)
        ));
    }
    lines
}
