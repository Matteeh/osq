//! The gates osq recorded while archiving a change.

use std::cmp::Ordering;

use serde_json::Value;

use crate::events::{Event, js_number};

use super::super::values::{number, render_nullish, round, text, time};

/// One gate line of the land view.
pub(super) struct Gate {
    /// The gate's display name, such as `task 1` or `validator`.
    pub(super) name: String,
    /// The recorded outcome.
    pub(super) outcome: String,
    /// The finite exit code, if any.
    pub(super) exit_code: Option<f64>,
    /// The rounded duration in seconds.
    pub(super) seconds: f64,
    /// The command the gate ran.
    pub(super) command: String,
    /// The finding count, only for the validator gate.
    pub(super) findings: Option<usize>,
}

impl Gate {
    /// The indented line the land view prints for this gate.
    ///
    /// Implements: rust-show/show-text
    pub(super) fn line(&self) -> String {
        let seconds = js_number(self.seconds);
        let outcome = if self.outcome == "failed" {
            self.exit_code.map_or_else(
                || self.outcome.clone(),
                |code| format!("{} exit {}", self.outcome, js_number(code)),
            )
        } else {
            self.outcome.clone()
        };
        let findings = self
            .findings
            .map_or_else(String::new, |count| format!(", {count} findings"));
        format!(
            "    {}: {outcome} in {seconds}s ({}){findings}",
            self.name, self.command
        )
    }
}

/// The gate runs osq recorded while archiving the change.
///
/// Implements: rust-show/show-text
pub(super) fn build(timeline: &[Event], verify: &str, check: Option<&str>) -> Vec<Gate> {
    let Some(cutoff) = archive_cutoff(timeline) else {
        return Vec::new();
    };
    let before: Vec<&Event> = timeline
        .iter()
        .filter(|event| time(&event.timestamp).is_some_and(|millis| millis <= cutoff))
        .collect();
    let mut gates = Vec::new();
    for task in task_numbers(&before) {
        let found = last(&before, |event| {
            event.task_number == task && event.kind == "verify_ran" && !has_phase(event)
        });
        if let Some(event) = found {
            gates.push(run_gate("task", Some(&task), event));
        }
    }
    if !verify.is_empty() {
        let found = last(&before, |event| {
            event.task_number == "change"
                && event.kind == "verify_ran"
                && command_of(event) == verify
        });
        if let Some(event) = found {
            gates.push(run_gate("verify", None, event));
        }
    }
    if let Some(check) = check {
        let found = last(&before, |event| {
            event.task_number == "change"
                && event.kind == "verify_ran"
                && command_of(event) == check
        });
        if let Some(event) = found {
            gates.push(run_gate("check", None, event));
        }
    }
    if let Some(event) = last(&before, |event| event.kind == "validator_ran") {
        gates.push(validator_gate(event));
    }
    gates
}

/// The milliseconds of the last usable `archived` event.
fn archive_cutoff(timeline: &[Event]) -> Option<i64> {
    let mut cutoff = None;
    for event in timeline {
        if event.kind != "archived" {
            continue;
        }
        if let Some(millis) = time(&event.timestamp) {
            let current = cutoff.unwrap_or(millis);
            cutoff = Some(current.max(millis));
        }
    }
    cutoff
}

/// The numbered task streams, in numeric order.
fn task_numbers(events: &[&Event]) -> Vec<String> {
    let mut numbers: Vec<String> = Vec::new();
    for event in events {
        let number = &event.task_number;
        if number.bytes().all(|byte| byte.is_ascii_digit()) && !numbers.contains(number) {
            numbers.push(number.clone());
        }
    }
    numbers.sort_by(
        |left, right| match (left.parse::<f64>(), right.parse::<f64>()) {
            (Ok(left), Ok(right)) => left.partial_cmp(&right).unwrap_or(Ordering::Equal),
            _ => Ordering::Equal,
        },
    );
    numbers
}

/// The latest event matching `matches`.
fn last<'a>(events: &[&'a Event], matches: impl Fn(&Event) -> bool) -> Option<&'a Event> {
    events.iter().rev().find(|event| matches(event)).copied()
}

/// Whether the event recorded a `phase`.
fn has_phase(event: &Event) -> bool {
    event.field("phase").is_some_and(Value::is_string)
}

/// The event's `data.command` string, or empty text.
fn command_of(event: &Event) -> String {
    event
        .field("command")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned()
}

/// A duration in whole seconds as the gate line prints it.
fn seconds(duration: Option<f64>) -> f64 {
    duration.map_or(0.0, round)
}

/// One `verify_ran`-derived gate, its outcome read from the exit code.
fn run_gate(kind: &str, task: Option<&str>, event: &Event) -> Gate {
    let exit_code = number(event.field("exitCode"));
    let name = task.map_or_else(|| kind.to_owned(), |task| format!("task {task}"));
    Gate {
        name,
        outcome: if exit_code == Some(0.0) {
            "passed".to_owned()
        } else {
            "failed".to_owned()
        },
        exit_code,
        seconds: seconds(number(event.field("duration"))),
        command: command_of(event),
        findings: None,
    }
}

/// The validator gate, whose command and outcome are its own.
fn validator_gate(event: &Event) -> Gate {
    let findings = match event.field("findings") {
        Some(Value::Array(items)) => items.len(),
        _ => 0,
    };
    Gate {
        name: "validator".to_owned(),
        outcome: text(event.field("outcome")).unwrap_or("unknown").to_owned(),
        exit_code: number(event.field("exitCode")),
        seconds: seconds(number(event.field("duration"))),
        command: format!(
            "{}/{}",
            render_nullish(event.field("harness"), "?"),
            render_nullish(event.field("model"), "?")
        ),
        findings: Some(findings),
    }
}
