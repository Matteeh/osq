//! The task fold: one task stream's events to one task's state.
//!
//! Implements: rust-core/task-fold
//! Implements: rust-core/fold-determinism

use crate::Event;

/// A task's status inside its change.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TaskStatus {
    /// Waiting to run.
    Pending,
    /// A harness is running it.
    Running,
    /// Finished and verified.
    Done,
    /// Given up on.
    Dead,
    /// Finished but its scope changed.
    Regressed,
}

/// One task's folded state.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TaskState {
    /// The task's status.
    pub status: TaskStatus,
    /// The execution attempt.
    pub attempt: u64,
    /// Why the task last changed, when it did.
    pub reason: Option<String>,
    /// The time a pause lasts until, when the task is paused.
    pub paused_until: Option<String>,
}

impl Default for TaskState {
    /// A new task: `Pending`, attempt 0, no reason and no pause.
    ///
    /// Implements: rust-core/task-fold
    fn default() -> Self {
        Self {
            status: TaskStatus::Pending,
            attempt: 0,
            reason: None,
            paused_until: None,
        }
    }
}

impl TaskState {
    /// A new task: `Pending`, attempt 0, no reason and no pause.
    ///
    /// Implements: rust-core/task-fold
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
}

/// Folds one task stream's event into the task's next state.
///
/// Implements: rust-core/task-fold
/// Implements: rust-core/fold-determinism
#[must_use]
pub fn apply_task(state: TaskState, event: &Event) -> TaskState {
    match event {
        Event::Started(data) => TaskState {
            status: TaskStatus::Running,
            attempt: data.attempt.unwrap_or(state.attempt + 1),
            paused_until: None,
            ..state
        },
        Event::Done(_) | Event::DoneManual(_) => TaskState {
            status: TaskStatus::Done,
            reason: None,
            ..state
        },
        Event::Dead(data) => TaskState {
            status: TaskStatus::Dead,
            reason: Some(data.reason.clone()),
            ..state
        },
        Event::Retry(data) => TaskState {
            status: TaskStatus::Pending,
            reason: Some(data.reason.clone()),
            ..state
        },
        Event::Regressed(data) => TaskState {
            status: TaskStatus::Regressed,
            reason: data.reason.clone().or(state.reason),
            ..state
        },
        Event::Recertification(data) => match data.outcome.as_str() {
            "passed" => TaskState {
                status: TaskStatus::Done,
                reason: None,
                ..state
            },
            "requeued" => TaskState {
                status: TaskStatus::Pending,
                reason: data.reason.clone().or(state.reason),
                ..state
            },
            _ => state,
        },
        Event::Paused(data) => TaskState {
            status: TaskStatus::Pending,
            paused_until: Some(data.until.clone()),
            ..state
        },
        _ => state,
    }
}
