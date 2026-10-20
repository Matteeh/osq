//! The pure scheduler: which approved changes may start now, and why the rest wait.
//!
//! A change holds the lock units of its approved task scope files. Two changes
//! overlap when they share a unit; [`lock_unit`] maps a file to its unit, so a
//! whole core or kernel crate locks as one and every other file locks alone.
//! [`schedule`] decides one state per queued change and the changes to start,
//! with no IO, as ADR 027 says.
//!
//! Implements: rust-core/lock-units
//! Implements: rust-core/change-scheduling
//! Implements: rust-core/schedule-states

use std::collections::BTreeSet;
use std::fmt;

/// One change a queued change depends on.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Dependency {
    /// The id of the change depended on.
    pub id: String,
    /// Whether that dependency is done.
    pub done: bool,
}

/// One approved change waiting in the queue.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QueuedChange {
    /// The change's id.
    pub id: String,
    /// Whether a human approved it.
    pub approved: bool,
    /// Its dependencies, in the order the plan lists them.
    pub dependencies: Vec<Dependency>,
    /// The files of its approved task scopes.
    pub files: Vec<String>,
}

/// One change now running.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RunningChange {
    /// The change's id.
    pub id: String,
    /// The files of its approved task scopes.
    pub files: Vec<String>,
}

/// One queued change's state, with its reason.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ScheduleState {
    /// Approved, every dependency done, and no overlap with a running or
    /// earlier started change.
    Ready,
    /// Not approved yet.
    NeedsApproval,
    /// An explicit dependency named by its id is not done.
    WaitingOn(String),
    /// It overlaps the named change on the shared lock units.
    BlockedBy {
        /// The id of the change it overlaps.
        id: String,
        /// The lock units the two changes share, in byte order.
        shared: Vec<String>,
    },
}

impl fmt::Display for ScheduleState {
    /// Writes the state as its reason.
    ///
    /// Implements: rust-core/schedule-states
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Ready => formatter.write_str("ready"),
            Self::NeedsApproval => formatter.write_str("needs approval"),
            Self::WaitingOn(id) => write!(formatter, "waiting on {id}"),
            Self::BlockedBy { id, shared } => {
                write!(formatter, "blocked by {id}: {}", shared.join(", "))
            }
        }
    }
}

/// One queued change with its state.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScheduledChange {
    /// The queued change's id.
    pub id: String,
    /// Its state in this scheduling pass.
    pub state: ScheduleState,
}

/// The result of one scheduling pass.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Schedule {
    /// One state per queued change that is not running, in queue order.
    pub states: Vec<ScheduledChange>,
    /// The ids of the ready changes, in queue order.
    pub start: Vec<String>,
}

/// One change with the lock units of its files.
struct LockedChange {
    /// The change's id.
    id: String,
    /// The distinct lock units its files hold.
    units: BTreeSet<String>,
}

/// Maps one file path to the lock unit it holds.
///
/// `crates/core/` locks the whole core crate, `crates/kernel/<name>/` locks that
/// whole kernel crate, and every other path locks itself.
///
/// Implements: rust-core/lock-units
#[must_use]
pub fn lock_unit(path: &str) -> String {
    if path.starts_with("crates/core/") {
        return "crates/core".to_owned();
    }
    if let Some(rest) = path.strip_prefix("crates/kernel/") {
        if let Some((name, _)) = rest.split_once('/') {
            return format!("crates/kernel/{name}");
        }
    }
    path.to_owned()
}

/// Decides one state per queued change and the changes that may start now.
///
/// A queued change whose id names a running change is left out. Every other
/// change takes the first state of "Schedule states" that holds, and a change
/// is started only when it is ready.
///
/// Implements: rust-core/change-scheduling
#[must_use]
pub fn schedule(queue: &[QueuedChange], running: &[RunningChange]) -> Schedule {
    let running_locked: Vec<LockedChange> = running.iter().map(locked_running).collect();
    let mut started: Vec<LockedChange> = Vec::new();
    let mut states = Vec::new();
    let mut start = Vec::new();
    for change in queue {
        if running_locked
            .iter()
            .any(|candidate| candidate.id == change.id)
        {
            continue;
        }
        let locked = locked_queued(change);
        let state = state_of(change, &running_locked, &started, &locked.units);
        if state == ScheduleState::Ready {
            start.push(change.id.clone());
            started.push(locked);
        }
        states.push(ScheduledChange {
            id: change.id.clone(),
            state,
        });
    }
    Schedule { states, start }
}

/// Takes the lock units of one running change.
fn locked_running(change: &RunningChange) -> LockedChange {
    LockedChange {
        id: change.id.clone(),
        units: lock_units(&change.files),
    }
}

/// Takes the lock units of one queued change.
fn locked_queued(change: &QueuedChange) -> LockedChange {
    LockedChange {
        id: change.id.clone(),
        units: lock_units(&change.files),
    }
}

/// Maps every file to its lock unit, dropping duplicates.
fn lock_units(files: &[String]) -> BTreeSet<String> {
    files.iter().map(|file| lock_unit(file)).collect()
}

/// Gives the first state of "Schedule states" that holds for one change.
fn state_of(
    change: &QueuedChange,
    running: &[LockedChange],
    started: &[LockedChange],
    units: &BTreeSet<String>,
) -> ScheduleState {
    if !change.approved {
        return ScheduleState::NeedsApproval;
    }
    if let Some(dependency) = change
        .dependencies
        .iter()
        .find(|dependency| !dependency.done)
    {
        return ScheduleState::WaitingOn(dependency.id.clone());
    }
    if let Some(state) = first_blocker(running, units) {
        return state;
    }
    if let Some(state) = first_blocker(started, units) {
        return state;
    }
    ScheduleState::Ready
}

/// Gives a blocked state for the first change that shares a unit, in order.
fn first_blocker(changes: &[LockedChange], units: &BTreeSet<String>) -> Option<ScheduleState> {
    changes.iter().find_map(|change| {
        let shared: Vec<String> = change.units.intersection(units).cloned().collect();
        if shared.is_empty() {
            None
        } else {
            Some(ScheduleState::BlockedBy {
                id: change.id.clone(),
                shared,
            })
        }
    })
}
