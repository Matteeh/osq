//! The pure folds from a change's event streams to task and change state.
//!
//! A change's events live in three streams: each task's own `<n>.jsonl`, the
//! change's `change.jsonl` and the validator's `validator.jsonl`. Folding a
//! stream's events in order gives a [`ChangeState`], and [`change_status`]
//! turns it and the approval into the status order TypeScript's
//! `deriveSpecState` uses.
//!
//! Implements: rust-core/event-streams
//! Implements: rust-core/task-fold
//! Implements: rust-core/change-fold
//! Implements: rust-core/fold-determinism
//! Implements: rust-core/change-status

mod change;
mod status;
mod stream;
mod task;

pub use change::{ChangeRecord, ChangeState, apply, apply_change};
pub use status::{ChangeStatus, change_status};
pub use stream::{Stream, TaskId};
pub use task::{TaskState, TaskStatus, apply_task};
