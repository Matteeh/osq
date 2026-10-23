//! The `Validation:` section of an archived change.

use serde_json::Value;

use crate::events::{Event, js_number, read};
use crate::model::Change;

use super::values::{join, number, render, render_nullish, round, text, time};

/// How each validator problem reads in a finding line.
fn problem_word(value: Option<&Value>) -> &'static str {
    match text(value) {
        Some("no_code") => "no code meets it",
        Some("no_test") => "no test covers it",
        Some("passes_without_change") => "its test passes without the change",
        _ => "undefined",
    }
}

/// The `Validation:` lines, or none for a change without a validation.
///
/// Implements: rust-show/show-text
pub(super) fn lines(change: &Change) -> Vec<String> {
    if !change.archived {
        return Vec::new();
    }
    let events = read(change);
    let Some(latest) = latest(&events.timeline) else {
        return Vec::new();
    };
    let mut lines = vec![String::new(), headline(latest)];
    lines.extend(finding_lines(latest));
    if let Some(Value::Array(items)) = latest.field("restored") {
        if !items.is_empty() {
            lines.push(format!("  Restored: {}", join(items)));
        }
    }
    lines
}

/// The latest change-stream `validator_ran` event, later events winning ties.
fn latest(timeline: &[Event]) -> Option<&Event> {
    let mut latest = None;
    let mut latest_time = None;
    for event in timeline {
        if event.kind != "validator_ran" || event.task_number != "change" {
            continue;
        }
        let event_time = time(&event.timestamp).unwrap_or(0);
        if latest.is_none() || latest_time.is_none_or(|current| event_time >= current) {
            latest = Some(event);
            latest_time = Some(event_time);
        }
    }
    latest
}

/// The `Validation:` headline, without the leading blank line.
fn headline(event: &Event) -> String {
    if text(event.field("outcome")) == Some("not_run") {
        let reason = render_nullish(event.field("reason"), "unknown");
        return format!("Validation: not run ({reason})");
    }
    let outcome = render(event.field("outcome"));
    let harness = render_nullish(event.field("harness"), "undefined");
    let model = render_nullish(event.field("model"), "undefined");
    let seconds = js_number(round(number(event.field("duration")).unwrap_or(0.0)));
    let run = format!("Validation: {outcome} by {harness}/{model} in {seconds}s");
    if text(event.field("outcome")) != Some("validated") {
        return run;
    }
    let scenarios = render(event.field("scenarios"));
    let findings = findings(event).len();
    format!("{run}, {scenarios} scenarios judged, {findings} findings")
}

/// The validated run's findings, or none for another outcome.
fn findings(event: &Event) -> &[Value] {
    if text(event.field("outcome")) != Some("validated") {
        return &[];
    }
    match event.field("findings") {
        Some(Value::Array(items)) => items,
        _ => &[],
    }
}

/// One line per finding of a validated run.
fn finding_lines(event: &Event) -> Vec<String> {
    findings(event)
        .iter()
        .map(|finding| {
            let capability = field(finding, "capability");
            let requirement = field(finding, "requirement");
            let scenario = field(finding, "scenario");
            let problem = problem_word(field(finding, "problem"));
            let detail = field(finding, "detail");
            format!(
                "  - {}: {} / {}: {problem}. {}",
                render(capability),
                render(requirement),
                render(scenario),
                render(detail)
            )
        })
        .collect()
}

/// A named field of one finding object.
fn field<'a>(finding: &'a Value, name: &str) -> Option<&'a Value> {
    finding.as_object()?.get(name)
}
