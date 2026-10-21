//! osq core: the types, state machines and traits every other crate builds on.
//!
//! Core does no IO and depends on nothing else in the workspace (ADR 022).

pub mod change;
pub mod event;
pub mod feature;
pub mod fold;
pub mod graph;
pub mod schedule;
pub mod seal;

pub use change::{ApproveError, Approved, ArchiveError, Archived, Change, Draft};
pub use event::{Envelope, Event, EventError, event_line, parse_event_line};
pub use feature::{Command, Feature, FeatureError, Invocation, Output};
pub use fold::{
    ChangeRecord, ChangeState, ChangeStatus, Stream, TaskId, TaskState, TaskStatus, apply,
    apply_change, apply_task, change_status,
};
pub use graph::{Edge, EdgeKind, Finding, Graph, Location, Node, NodeId, Rule, run_rules, tag_id};
pub use schedule::{
    Dependency, QueuedChange, RunningChange, Schedule, ScheduleState, ScheduledChange, lock_unit,
    schedule,
};
pub use seal::{ComputedSeal, Seal, SealError, compute_seal};
