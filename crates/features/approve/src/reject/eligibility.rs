//! Deciding whether an approved change has failed, from its marker facts.

use super::markers::Markers;

/// Whether `.run/approved` holds text that is not blank.
///
/// Implements: rust-approve/reject-refusals
pub(crate) fn approved(markers: &Markers) -> bool {
    markers
        .approved
        .as_deref()
        .is_some_and(|text| !text.trim().is_empty())
}

/// Whether the change has any running task.
///
/// Implements: rust-approve/reject-refusals
pub(crate) fn running(markers: &Markers) -> bool {
    !markers.running.is_empty()
}

/// Whether the change is failed as TypeScript's `deriveSpecState` gives.
///
/// Implements: rust-approve/reject-eligibility
pub(crate) fn failed(markers: &Markers) -> bool {
    markers.regressed.contains("change")
        || markers.tasks.iter().any(|task| task_failed(markers, task))
}

/// Whether one task file's markers make the change failed.
fn task_failed(markers: &Markers, task: &str) -> bool {
    markers.regressed.contains(task)
        || (markers.dead.contains(task) && !markers.done.contains(task))
}
