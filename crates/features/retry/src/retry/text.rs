//! Every text a retry refuses with or prints, exactly as TypeScript writes it.

use std::fmt::Write as _;
use std::path::Path;

use osq_core::FeatureError;

use super::args::CHANGE;

/// The failed error for a refusal or a write that did not finish.
///
/// Implements: rust-retry/retry-arguments
/// Implements: rust-retry/retry-refusals
/// Implements: rust-retry/retry-record
pub(crate) fn failed(message: impl Into<String>) -> FeatureError {
    FeatureError::failed("retry", message)
}

/// The refusal for a target that is neither `change` nor all digits.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn invalid_target(target: &str) -> FeatureError {
    failed(format!(
        "Invalid retry target \"{target}\": expected a numeric task or \"change\"."
    ))
}

/// The refusal for an id that names no active change.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn not_found(query: &str, changes: &Path) -> FeatureError {
    failed(format!(
        "Spec \"{query}\" not found in {}",
        changes.display()
    ))
}

/// The refusal for a task target on an archived change.
///
/// Implements: rust-retry/archived-retry
pub(crate) fn archived_task(folder: &str, id: &str) -> FeatureError {
    failed(format!(
        "{folder} has archived; osq retry clears only its land stop: osq retry {id} change"
    ))
}

/// The failure for an archived retry whose commit did not finish.
///
/// Implements: rust-retry/archived-retry
pub(crate) fn commit_failed(error: &str) -> FeatureError {
    failed(format!("osq could not record the retry: {error}"))
}

/// The refusal for a change without a non-blank approval marker.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn not_approved(id: &str) -> FeatureError {
    failed(format!(
        "Change {id} is not approved. Run `osq approve {id}` before retrying."
    ))
}

/// The refusal for an approval marker that no longer matches the folder.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn stale_approval(id: &str) -> FeatureError {
    failed(format!(
        "Change {id} no longer matches its approved hash. Run `osq approve {id}` before retrying."
    ))
}

/// The refusal for a `change` retry while any task runs.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn change_running(id: &str) -> FeatureError {
    failed(format!("Change {id} has a running task; retry is refused."))
}

/// The refusal naming a pid that a stopped watcher left behind.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn task_left_running(id: &str, task: &str, pid: i64) -> FeatureError {
    failed(format!(
        "Task {task} was left running by a stopped watcher (pid {pid}); run osq watch to reap it, then osq retry {id} {task} if it stays dead."
    ))
}

/// The refusal for a task whose pid file names a live process or none.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn task_running(task: &str) -> FeatureError {
    failed(format!("Task {task} is running; retry is refused."))
}

/// The refusal for a target with no active failure marker.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn no_marker(target: &str, folder: &str) -> FeatureError {
    if target == CHANGE {
        failed(format!(
            "No active failure marker for change-level regression in {folder}; retry is refused."
        ))
    } else {
        failed(format!(
            "No active failure marker for task {target} in {folder}; retry is refused."
        ))
    }
}

/// The refusal for a marker reason that is not one osq knows.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn unknown_reason(reason: &str) -> FeatureError {
    failed(format!(
        "Marker reason \"{reason}\" is not one osq knows; retry is refused."
    ))
}

/// The output lines after the markers are retained and the event is written.
///
/// Implements: rust-retry/retry-record
pub(crate) fn retried(
    id: &str,
    target: &str,
    reason: &str,
    attempt: u64,
    retained: &[String],
) -> String {
    let label = if target == CHANGE {
        CHANGE.to_owned()
    } else {
        format!("task {target}")
    };
    let mut text = format!("Retried {id} {label} (next attempt: {attempt})\n");
    let _ = writeln!(text, "  Reason: {reason}");
    push_retained(&mut text, retained);
    text
}

/// The output lines of a passing recertification.
///
/// Implements: rust-retry/scope-recertification
pub(crate) fn recertified(id: &str, task: &str, retained: &[String]) -> String {
    let mut text = format!("Recertified {id} task {task} (scope regression cleared)\n");
    text.push_str("  Reason: scope_regression\n");
    push_retained(&mut text, retained);
    text
}

/// The output lines of a recertification that must run again.
///
/// Implements: rust-retry/scope-recertification
pub(crate) fn requeued(id: &str, task: &str, attempt: u64, retained: &[String]) -> String {
    let mut text = format!("Requeued {id} task {task} for agent work (next attempt: {attempt})\n");
    text.push_str("  Reason: scope_regression\n");
    push_retained(&mut text, retained);
    text
}

/// Appends one `Retained` line per renamed file.
///
/// Implements: rust-retry/retry-record
fn push_retained(text: &mut String, retained: &[String]) {
    for path in retained {
        let _ = writeln!(text, "  Retained: {path}");
    }
}
