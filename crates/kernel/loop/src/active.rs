//! Reading a project's active changes into core's scheduler.
//!
//! Implements: rust-loop/active-schedule

use std::collections::BTreeMap;
use std::fmt;
use std::path::Path;

use osq_core::{Dependency, QueuedChange, RunningChange, ScheduleState, schedule};
use osq_kernel_specs::{SpecsError, read_proposal};
use osq_kernel_storage::{
    ChangeEntry, ChangeSnapshot, Location, StorageError, list_changes, read_change,
};

use crate::scope_files;

/// One active change's state.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ActiveState {
    /// The change is approved and a task is done or started.
    Running,
    /// The change waits, with core's state.
    Queued(ScheduleState),
}

impl fmt::Display for ActiveState {
    /// Writes `running`, or the queued state.
    ///
    /// Implements: rust-loop/active-schedule
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Running => formatter.write_str("running"),
            Self::Queued(state) => write!(formatter, "{state}"),
        }
    }
}

/// One active change with its state.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActiveChange {
    /// The snapshot's id.
    pub id: String,
    /// The change folder's name.
    pub folder: String,
    /// The change's state.
    pub state: ActiveState,
}

/// Every active change's state and the changes to start.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActiveSchedule {
    /// One entry per active change, in listing order.
    pub changes: Vec<ActiveChange>,
    /// The ids of the changes core starts.
    pub start: Vec<String>,
}

/// Why reading a project's active changes failed.
#[derive(Debug)]
pub enum LoopError {
    /// The storage kernel refused a change folder.
    Storage(StorageError),
    /// The specs kernel refused a change's proposal.
    Specs(SpecsError),
}

impl fmt::Display for LoopError {
    /// Writes the error it holds.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Storage(error) => write!(formatter, "{error}"),
            Self::Specs(error) => write!(formatter, "{error}"),
        }
    }
}

impl std::error::Error for LoopError {
    /// The error that caused this one.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Storage(error) => Some(error),
            Self::Specs(error) => Some(error),
        }
    }
}

/// One active change read with whether it is running.
struct ActiveRead {
    /// The change folder's snapshot.
    snapshot: ChangeSnapshot,
    /// Whether the change is running.
    running: bool,
}

/// Gives every active change its state and the changes to start.
///
/// Implements: rust-loop/active-schedule
///
/// # Errors
///
/// Returns [`LoopError::Storage`] when the storage kernel refuses a change, and
/// [`LoopError::Specs`] when a `proposal.md` that exists does not read.
pub fn active_schedule(project_root: &Path) -> Result<ActiveSchedule, LoopError> {
    let entries = list_changes(project_root);
    let archived: Vec<&ChangeEntry> = entries
        .iter()
        .filter(|entry| entry.location == Location::Archived)
        .collect();
    let mut reads = Vec::new();
    let mut running = Vec::new();
    let mut queued = Vec::new();
    for entry in entries
        .iter()
        .filter(|entry| entry.location == Location::Active)
    {
        let dependencies = dependencies(&entry.path, &archived)?;
        let snapshot = read_change(entry).map_err(LoopError::Storage)?;
        let files = if snapshot.approved {
            files_of(project_root, &snapshot)
        } else {
            Vec::new()
        };
        let running_now = is_running(&snapshot);
        if running_now {
            running.push(RunningChange {
                id: snapshot.id.clone(),
                files,
            });
        } else {
            queued.push(QueuedChange {
                id: snapshot.id.clone(),
                approved: snapshot.approved,
                dependencies,
                files,
            });
        }
        reads.push(ActiveRead {
            snapshot,
            running: running_now,
        });
    }
    let scheduled = schedule(&queued, &running);
    let mut states: BTreeMap<String, ScheduleState> = scheduled
        .states
        .into_iter()
        .map(|change| (change.id, change.state))
        .collect();
    let changes = reads
        .into_iter()
        .map(|read| {
            let state = if read.running {
                ActiveState::Running
            } else {
                ActiveState::Queued(
                    states
                        .remove(&read.snapshot.id)
                        .unwrap_or(ScheduleState::NeedsApproval),
                )
            };
            ActiveChange {
                id: read.snapshot.id,
                folder: read.snapshot.folder,
                state,
            }
        })
        .collect();
    Ok(ActiveSchedule {
        changes,
        start: scheduled.start,
    })
}

/// Reads a change's proposal dependencies, or none without a proposal.
///
/// # Errors
///
/// Returns [`LoopError::Specs`] when a `proposal.md` that exists does not read.
fn dependencies(folder: &Path, archived: &[&ChangeEntry]) -> Result<Vec<Dependency>, LoopError> {
    let path = folder.join("proposal.md");
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let proposal = read_proposal(&path).map_err(LoopError::Specs)?;
    Ok(proposal
        .depends_on
        .into_iter()
        .map(|id| Dependency {
            done: archived.iter().any(|entry| archived_matches(entry, &id)),
            id,
        })
        .collect())
}

/// Whether an archived change has the dependency's id or folder name.
fn archived_matches(entry: &ChangeEntry, id: &str) -> bool {
    entry.folder == id || leading_digits(&entry.folder) == id
}

/// The leading digits of a folder name, or empty text without any.
fn leading_digits(folder: &str) -> String {
    folder.chars().take_while(char::is_ascii_digit).collect()
}

/// Whether a change is approved with a done or started task.
fn is_running(snapshot: &ChangeSnapshot) -> bool {
    snapshot.approved
        && snapshot
            .tasks
            .iter()
            .any(|task| task.done || task.started > 0)
}

/// The files of every task scope, resolved against the project.
fn files_of(project_root: &Path, snapshot: &ChangeSnapshot) -> Vec<String> {
    let scope: Vec<String> = snapshot
        .tasks
        .iter()
        .flat_map(|task| task.plan.scope.iter().cloned())
        .collect();
    scope_files(project_root, &scope)
}
