//! Retiring the steering triggers an `approved` event names.

use std::fs;
use std::path::Path;

use osq_core::event::Event;
use osq_core::{Envelope, FeatureError, parse_event_line};

use super::args::CHANGE;

/// Retries each of an approved event's targets that still holds a failure.
///
/// # Errors
///
/// Returns the first retry refusal or write error, leaving the targets before
/// it retired and the ones after it untouched.
///
/// Implements: rust-retry/approval-reaction
pub(crate) fn run(root: &Path, change: &Path, envelope: &Envelope) -> Result<(), FeatureError> {
    let Event::Approved(approved) = &envelope.event else {
        return Ok(());
    };
    let folder_name = change.file_name().unwrap_or_default().to_string_lossy();
    let tree = change.ancestors().nth(3).unwrap_or(change);
    for target in &approved.targets {
        if retired(change, target, &envelope.timestamp) {
            continue;
        }
        super::finish(root, tree, change, &folder_name, target)?;
    }
    Ok(())
}

/// Whether a target has no active marker or records a failure at or after the event.
///
/// Implements: rust-retry/approval-reaction
fn retired(change: &Path, target: &str, approved: &str) -> bool {
    if !has_marker(change, target) {
        return true;
    }
    failure_at_or_after(change, target, approved)
}

/// Whether `.run/regressed/<target>.md` or a task's dead marker exists.
///
/// Implements: rust-retry/approval-reaction
fn has_marker(change: &Path, target: &str) -> bool {
    let run = change.join(".run");
    let regressed = run.join("regressed").join(format!("{target}.md"));
    regressed.exists()
        || (target != CHANGE && run.join("dead").join(format!("{target}.md")).exists())
}

/// Whether the target's stream records a failure for it at or after the event.
///
/// Implements: rust-retry/approval-reaction
fn failure_at_or_after(change: &Path, target: &str, approved: &str) -> bool {
    let path = change
        .join(".run")
        .join("events")
        .join(format!("{target}.jsonl"));
    let text = fs::read_to_string(path).unwrap_or_default();
    text.lines().any(|line| {
        let Ok(envelope) = parse_event_line(line) else {
            return false;
        };
        let matches = match &envelope.event {
            Event::Retry(retry) => retry.target == target,
            Event::Regressed(regressed) => regressed.task.as_deref() == Some(target),
            Event::Dead(dead) => dead.task == target,
            _ => false,
        };
        matches && envelope.timestamp.as_str() >= approved
    })
}
