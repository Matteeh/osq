//! osq core: the types, state machines and traits every other crate builds on.
//!
//! Core does no IO and depends on nothing else in the workspace (ADR 022).

pub mod change;
pub mod change_id;
pub mod event;
pub mod feature;
pub mod fold;
pub mod graph;
pub mod schedule;
pub mod scope;
pub mod seal;

pub use change::{ApproveError, Approved, ArchiveError, Archived, Change, Draft};
pub use change_id::{ChangeId, ChangeIdError, parse_change_id};
pub use event::{Envelope, Event, EventError, EventKind, event_line, parse_event_line};
pub use feature::{Command, Feature, FeatureError, Invocation, Output, Reaction};
pub use fold::{
    ChangeRecord, ChangeState, ChangeStatus, Stream, TaskId, TaskState, TaskStatus, apply,
    apply_change, apply_task, change_status,
};
pub use graph::{Edge, EdgeKind, Finding, Graph, Location, Node, NodeId, Rule, run_rules, tag_id};
pub use schedule::{
    Dependency, QueuedChange, RunningChange, Schedule, ScheduleState, ScheduledChange, lock_unit,
    schedule,
};
pub use scope::{
    ChangedPath, DisallowReason, Disallowed, LockRule, PathChange, ScopeAudit, audit_scope,
    scope_covers_path,
};
pub use seal::{ComputedSeal, Seal, SealError, compute_seal};
