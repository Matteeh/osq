//! The change typestate: only a seal check approves and only a done change archives.
//!
//! A [`Change`] carries a state type: [`Draft`] before approval, [`Approved`]
//! after a matching seal, and [`Archived`] after it is done. The change's
//! fields and each state type's fields are private, so the only paths to a
//! `Change<Approved>` and a `Change<Archived>` are [`Change::approve`] and
//! [`Change::archive`].
//!
//! Implements: rust-core/change-typestate

use crate::fold::{ChangeState, ChangeStatus, TaskId, TaskStatus, change_status};
use crate::seal::Seal;

/// A change in one of three states: [`Draft`], [`Approved`] or [`Archived`].
///
/// [`Change::draft`] is the only public constructor. [`Change::approve`] is
/// the only way to a `Change<Approved>`, and [`Change::archive`] the only way
/// to a `Change<Archived>`.
///
/// Implements: rust-core/change-typestate
///
/// Gates cannot be skipped: building a `Change<Approved>` by hand does not
/// compile, because `Change` and `Approved` have private fields.
///
/// ```compile_fail,E0451
/// use osq_core::{Approved, Change, Seal, TaskId};
///
/// let seal = Seal::parse(&format!("sha256:{}", "a".repeat(64))).unwrap();
/// let change: Change<Approved> = Change {
///     id: "204-rust-core".to_owned(),
///     tasks: vec![TaskId::new("1")],
///     state: Approved { seal },
/// };
/// ```
///
/// Gates cannot be skipped: building a `Change<Archived>` by hand does not
/// compile, because `Change` and `Archived` have private fields.
///
/// ```compile_fail,E0603
/// use osq_core::{Archived, Change, TaskId};
///
/// let change: Change<Archived> = Change {
///     id: "204-rust-core".to_owned(),
///     tasks: vec![TaskId::new("1")],
///     state: Archived(()),
/// };
/// ```
///
/// Gates cannot be skipped: `next_task` exists only on a `Change<Approved>`,
/// so calling it on a draft does not compile.
///
/// ```compile_fail,E0599
/// use osq_core::{Change, ChangeState, TaskId};
///
/// let draft = Change::draft("204-rust-core", [TaskId::new("1")]);
/// let state = ChangeState::new([TaskId::new("1")]);
/// let _ = draft.next_task(&state);
/// ```
///
/// Gates cannot be skipped: `archive` exists only on a `Change<Approved>`, so
/// calling it on a draft does not compile.
///
/// ```compile_fail,E0599
/// use osq_core::{Change, ChangeState, TaskId};
///
/// let draft = Change::draft("204-rust-core", [TaskId::new("1")]);
/// let state = ChangeState::new([TaskId::new("1")]);
/// let _ = draft.archive(&state);
/// ```
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Change<S> {
    /// The change's id.
    id: String,
    /// The change's task ids.
    tasks: Vec<TaskId>,
    /// The state that proves the change passed its gate.
    state: S,
}

/// A change that has not been approved.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Draft(());

/// A change whose recorded seal matched the computed one.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Approved {
    /// The seal that approved the change.
    seal: Seal,
}

/// A change that was archived once it was done.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Archived(());

impl Change<Draft> {
    /// Starts a change in the draft state.
    ///
    /// Implements: rust-core/change-typestate
    #[must_use]
    pub fn draft(id: impl Into<String>, tasks: impl IntoIterator<Item = TaskId>) -> Self {
        Self {
            id: id.into(),
            tasks: tasks.into_iter().collect(),
            state: Draft(()),
        }
    }

    /// Approves the change when the recorded seal equals the computed one.
    ///
    /// # Errors
    ///
    /// Returns [`ApproveError::SealMismatch`] carrying both seals when
    /// `recorded` does not equal `computed`.
    ///
    /// Implements: rust-core/change-typestate
    pub fn approve(self, recorded: Seal, computed: Seal) -> Result<Change<Approved>, ApproveError> {
        if recorded == computed {
            Ok(Change {
                id: self.id,
                tasks: self.tasks,
                state: Approved { seal: recorded },
            })
        } else {
            Err(ApproveError::SealMismatch { recorded, computed })
        }
    }
}

impl<S> Change<S> {
    /// The change's id.
    ///
    /// Implements: rust-core/change-typestate
    #[must_use]
    pub fn id(&self) -> &str {
        &self.id
    }

    /// The change's task ids.
    ///
    /// Implements: rust-core/change-typestate
    #[must_use]
    pub fn tasks(&self) -> &[TaskId] {
        &self.tasks
    }
}

impl Change<Approved> {
    /// The seal that approved the change.
    ///
    /// Implements: rust-core/change-typestate
    #[must_use]
    pub fn seal(&self) -> &Seal {
        &self.state.seal
    }

    /// The lowest pending task id, or none when the change is not pending.
    ///
    /// Implements: rust-core/change-typestate
    #[must_use]
    pub fn next_task(&self, state: &ChangeState) -> Option<TaskId> {
        if change_status(true, state) != ChangeStatus::Pending {
            return None;
        }
        self.tasks
            .iter()
            .filter(|id| {
                state
                    .tasks
                    .get(*id)
                    .is_none_or(|task| task.status == TaskStatus::Pending)
            })
            .min()
            .cloned()
    }

    /// Archives the change when it is done.
    ///
    /// # Errors
    ///
    /// Returns [`ArchiveError::NotDone`] carrying the status when
    /// `change_status(true, state)` is not [`ChangeStatus::Done`].
    ///
    /// Implements: rust-core/change-typestate
    pub fn archive(self, state: &ChangeState) -> Result<Change<Archived>, ArchiveError> {
        match change_status(true, state) {
            ChangeStatus::Done => Ok(Change {
                id: self.id,
                tasks: self.tasks,
                state: Archived(()),
            }),
            status => Err(ArchiveError::NotDone(status)),
        }
    }
}

/// Why a change could not be approved.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ApproveError {
    /// The recorded seal differs from the computed one.
    SealMismatch {
        /// The seal read from the marker.
        recorded: Seal,
        /// The seal computed over the change.
        computed: Seal,
    },
}

/// Why a change could not be archived.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ArchiveError {
    /// The change is not done.
    NotDone(ChangeStatus),
}
