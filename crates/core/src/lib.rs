//! osq core: the types, state machines and traits every other crate builds on.
//!
//! Core does no IO and depends on nothing else in the workspace (ADR 022).

pub mod change;
pub mod event;
pub mod fold;
pub mod seal;

pub use change::{ApproveError, Approved, ArchiveError, Archived, Change, Draft};
pub use event::{Envelope, Event, EventError, event_line, parse_event_line};
pub use fold::{
    ChangeRecord, ChangeState, ChangeStatus, Stream, TaskId, TaskState, TaskStatus, apply,
    apply_change, apply_task, change_status,
};
pub use seal::{Seal, SealError};
