//! The refusal, marker and ending texts `run` writes.

use std::path::Path;

/// The refusal for an id that names no active change.
///
/// Implements: rust-run/run-refusals
pub(crate) fn not_found(id: &str, changes: &Path) -> String {
    format!("Spec \"{id}\" not found in {}", changes.display())
}

/// The refusal for a change that has no task file.
///
/// Implements: rust-run/run-refusals
pub(crate) fn missing_task(task: &str, folder: &str) -> String {
    format!("Task {task} not found in {folder}")
}

/// The refusal for an executor harness other than pi.
///
/// Implements: rust-run/run-refusals
pub(crate) fn unsupported_harness(harness: &str) -> String {
    format!("Rust run supports only the pi harness, not {harness}")
}

/// The refusal for a root outside a git repository.
///
/// Implements: rust-run/run-refusals
pub(crate) fn no_git(root: &Path) -> String {
    format!("Rust run needs a git repository at {}", root.display())
}

/// The refusal for a task that already ended in `kind`.
///
/// Implements: rust-run/run-refusals
pub(crate) fn marker_exists(task: &str, folder: &str, kind: &str) -> String {
    format!("Task {task} of {folder} is {kind}; nothing to run")
}

/// The refusal for a lock another run holds.
///
/// Implements: rust-run/run-refusals
pub(crate) fn already_running(task: &str, folder: &str) -> String {
    format!("Task {task} of {folder} is already running")
}

/// The failure for a start that paused on a usage limit.
///
/// Implements: rust-run/executor-start
pub(crate) fn usage_limit(task: &str, folder: &str) -> String {
    format!("task {task} of {folder} paused on a usage limit")
}

/// The ending of a task whose verdict passed.
///
/// Implements: rust-run/done-record
pub(crate) fn done(task: &str, folder: &str) -> String {
    format!("Task {task} of {folder} done\n")
}

/// The ending for a harness that could not start at all.
///
/// Implements: rust-run/executor-start
pub(crate) fn cannot_start(task: &str, folder: &str) -> String {
    format!("task {task} of {folder} cannot start yet")
}

/// The failed text for a task that died with `reason`.
///
/// Implements: rust-run/dead-record
pub(crate) fn died(task: &str, folder: &str, reason: &str) -> String {
    format!("task {task} of {folder} died: {reason}")
}

/// TypeScript's dead marker for a missing approval.
///
/// Implements: rust-run/run-approval-check
pub(crate) fn missing_approval() -> String {
    "---\nreason: spec_conflict\n---\nSpec has not been approved (missing .run/approved).\n"
        .to_owned()
}

/// TypeScript's dead marker for an approval that names another seal.
///
/// Implements: rust-run/run-approval-check
pub(crate) fn changed_approval(approved: &str, current: &str) -> String {
    format!(
        "---\nreason: spec_conflict\napproved_hash: \"{approved}\"\ncurrent_hash: \"{current}\"\n---\nChange folder modified after approval. Expected {approved}, computed {current}.\n"
    )
}
