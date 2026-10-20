//! The status order a change's state derives.
//!
//! Implements: rust-core/change-status

use super::{ChangeState, TaskStatus};

/// A change's overall status.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChangeStatus {
    /// The change was rejected.
    Rejected,
    /// The change was archived.
    Archived,
    /// The change has no approval seal.
    Unapproved,
    /// The change, or one of its tasks, regressed.
    Regressed,
    /// A task died.
    Dead,
    /// A task is running.
    Running,
    /// Every task is done, including when there are none.
    Done,
    /// Otherwise.
    Pending,
}

/// Returns the change's status: the first rule that holds.
///
/// Implements: rust-core/change-status
#[must_use]
pub fn change_status(approved: bool, state: &ChangeState) -> ChangeStatus {
    let statuses: Vec<TaskStatus> = state.tasks().values().map(|task| task.status).collect();
    if state.record().rejected.is_some() {
        ChangeStatus::Rejected
    } else if state.record().archived.is_some() {
        ChangeStatus::Archived
    } else if !approved {
        ChangeStatus::Unapproved
    } else if state.record().regressed || statuses.contains(&TaskStatus::Regressed) {
        ChangeStatus::Regressed
    } else if statuses.contains(&TaskStatus::Dead) {
        ChangeStatus::Dead
    } else if statuses.contains(&TaskStatus::Running) {
        ChangeStatus::Running
    } else if statuses.iter().all(|status| *status == TaskStatus::Done) {
        ChangeStatus::Done
    } else {
        ChangeStatus::Pending
    }
}
