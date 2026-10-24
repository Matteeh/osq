//! Counting a task stream's scope-regression detections and recertifications.
//!
//! Implements: rust-storage/task-history

use super::ScopeHistory;
use super::stream::Event;

/// Counts scope detections, their verify outcomes and the recertifications.
pub(super) fn count(events: &[Event]) -> ScopeHistory {
    let mut history = ScopeHistory::default();
    for event in events {
        match event.kind() {
            Some("regressed") => detect(&mut history, event),
            Some("recertification") => recertify(&mut history, event),
            _ => {}
        }
    }
    history
}

/// Counts one `regressed` event when its reason is `scope_regression`.
fn detect(history: &mut ScopeHistory, event: &Event) {
    if event.text("reason") != Some("scope_regression") {
        return;
    }
    history.detected += 1;
    let Some(code) = event.number("exitCode") else {
        return;
    };
    if code == 0.0 {
        history.passed_at_detection += 1;
    } else {
        history.failed_at_detection += 1;
    }
}

/// Counts one `recertification` event by its outcome and automatic flag.
fn recertify(history: &mut ScopeHistory, event: &Event) {
    match event.text("outcome") {
        Some("passed") => {
            if event.is_true("automatic") {
                history.recertified_automatically += 1;
            } else {
                history.recertified_by_human += 1;
            }
        }
        Some("requeued") => history.requeued_for_agent += 1,
        _ => {}
    }
}
