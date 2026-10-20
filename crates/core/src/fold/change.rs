//! The change fold: a change stream's events and every task stream's to state.
//!
//! Implements: rust-core/change-fold
//! Implements: rust-core/fold-determinism

use std::collections::BTreeMap;

use super::{Stream, TaskId, TaskState, apply_task};
use crate::Event;

/// What the change stream itself records.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ChangeRecord {
    /// Whether the change regressed.
    pub regressed: bool,
    /// The archive path, once archived.
    pub archived: Option<String>,
    /// Why the change was rejected, once rejected.
    pub rejected: Option<String>,
}

impl ChangeRecord {
    /// A new record: not regressed, archived or rejected.
    ///
    /// Implements: rust-core/change-fold
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
}

/// One change's folded state: its record and one state per task id.
///
/// A state comes only from [`ChangeState::new`] and [`apply`]. Gates cannot be
/// skipped: building a state by hand does not compile, because its fields are
/// private.
///
/// ```compile_fail,E0451
/// use osq_core::{ChangeRecord, ChangeState, TaskId, TaskState};
/// use std::collections::BTreeMap;
///
/// let state = ChangeState {
///     record: ChangeRecord::new(),
///     tasks: BTreeMap::<TaskId, TaskState>::new(),
/// };
/// ```
///
/// Gates cannot be skipped: writing a state's `record` or `tasks` does not
/// compile, because its fields are private.
///
/// ```compile_fail,E0616
/// use osq_core::{ChangeRecord, ChangeState, TaskId};
///
/// let mut state = ChangeState::new([TaskId::new("1")]);
/// state.record = ChangeRecord::new();
/// ```
///
/// Implements: rust-core/change-fold
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChangeState {
    /// The change-level record.
    record: ChangeRecord,
    /// One state per task id, in task id order.
    tasks: BTreeMap<TaskId, TaskState>,
}

impl ChangeState {
    /// A state holding a new task per given id.
    ///
    /// Implements: rust-core/change-fold
    #[must_use]
    pub fn new<I, T>(tasks: I) -> Self
    where
        I: IntoIterator<Item = T>,
        T: Into<TaskId>,
    {
        Self {
            record: ChangeRecord::new(),
            tasks: tasks
                .into_iter()
                .map(|id| (id.into(), TaskState::new()))
                .collect(),
        }
    }

    /// The change-level record.
    ///
    /// Implements: rust-core/change-fold
    #[must_use]
    pub fn record(&self) -> &ChangeRecord {
        &self.record
    }

    /// One state per task id, in task id order.
    ///
    /// Implements: rust-core/change-fold
    #[must_use]
    pub fn tasks(&self) -> &BTreeMap<TaskId, TaskState> {
        &self.tasks
    }
}

/// Folds one change stream's event into the change record.
///
/// Implements: rust-core/change-fold
/// Implements: rust-core/fold-determinism
#[must_use]
pub fn apply_change(record: ChangeRecord, event: &Event) -> ChangeRecord {
    match event {
        Event::Regressed(data) if data.task.as_deref() == Some("change") => ChangeRecord {
            regressed: true,
            ..record
        },
        Event::Retry(data) if data.target == "change" => ChangeRecord {
            regressed: false,
            ..record
        },
        Event::Archived(data) => ChangeRecord {
            archived: Some(data.archive_path.clone()),
            ..record
        },
        Event::Rejected(data) => ChangeRecord {
            rejected: Some(data.reason.clone()),
            ..record
        },
        _ => record,
    }
}

/// Folds an event from its stream into the change state.
///
/// Implements: rust-core/change-fold
/// Implements: rust-core/fold-determinism
#[must_use]
pub fn apply(mut state: ChangeState, stream: &Stream, event: &Event) -> ChangeState {
    match stream {
        Stream::Task(id) => {
            let current = state.tasks.get(id).cloned().unwrap_or_default();
            state.tasks.insert(id.clone(), apply_task(current, event));
            state
        }
        Stream::Change => ChangeState {
            record: apply_change(state.record, event),
            ..state
        },
        Stream::Validator => state,
    }
}
