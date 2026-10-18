//! Reading one change folder into a snapshot and an archive into many.

mod events;
mod folder;
mod outcomes;
mod records;
mod specs;
mod table_events;

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use osq_core::{ChangeState, ChangeStatus, TaskId, change_status};

use super::results::read_disclosures;
use super::{ChangeEntry, Location, StorageError, TaskDisclosure};
use events::read_events;
use folder::{approved_at, read_manifest, read_planner, read_proposal, read_task_files};
pub use outcomes::TaskOutcomeFacts;
pub use records::{LinkEntry, ManifestNotices, Notice, PlanRecord};
use records::{manifest_notices, plan_records};
pub use specs::CapabilityDelta;
use specs::{read_deltas, read_verify};
pub use table_events::TableEvent;

/// One `tasks/<n>.md` file with what its plan, markers and stream say.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TaskFile {
    /// The task id, from the file's name.
    pub id: TaskId,
    /// The frontmatter title, trimmed, else empty text.
    pub title: String,
    /// Whether `.run/done/<n>` exists.
    pub done: bool,
    /// The `started` events in the task's stream, 0 without one.
    pub started: u64,
    /// The specs kernel's parse of the task file.
    pub plan: osq_kernel_specs::TaskFile,
    /// What the task's own stream says, the default without one.
    pub outcome: TaskOutcomeFacts,
}

/// One `dead` event: the task that died and why.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeadAttempt {
    /// The event's task, trimmed, else the stream's task id.
    pub task: String,
    /// The event's reason, trimmed, else `unknown`.
    pub reason: String,
}

/// What the event files of one change say, or `None` without `.run/events/`.
#[derive(Clone, Debug, PartialEq)]
pub struct EventFacts {
    /// The `started` events of each task stream, keyed by its task id.
    pub started: BTreeMap<TaskId, u64>,
    /// The `retry` events whose `automatic` is not true.
    pub halts: u64,
    /// The sum of every reported `tokens` cost, or `None` when none reported one.
    pub cost: Option<f64>,
    /// The `dead` events of the task streams, in task and file order.
    pub dead_attempts: Vec<DeadAttempt>,
    /// The last readable `archived` event's timestamp in `change.jsonl`.
    pub archived_at: Option<String>,
    /// The events the nine event tables are built from, in fold order.
    pub table_events: Vec<TableEvent>,
    /// Each task stream's outcome facts, keyed by its task id.
    pub outcomes: BTreeMap<TaskId, TaskOutcomeFacts>,
}

/// One change folder read into its typed fields and folded event state.
#[derive(Clone, Debug, PartialEq)]
pub struct ChangeSnapshot {
    /// The folder's leading digits.
    pub id: String,
    /// The folder name.
    pub folder: String,
    /// Where the folder sits.
    pub location: Location,
    /// The proposal's frontmatter title, trimmed, non-empty.
    pub title: Option<String>,
    /// The proposal body's `## Goal` section, trimmed, non-empty.
    pub goal: Option<String>,
    /// The manifest planner, else the brief's, trimmed, non-empty.
    pub planner: Option<String>,
    /// Whether `.run/approved` exists.
    pub approved: bool,
    /// The manifest `approvedAt` when approved and it reads as a timestamp.
    pub approved_at: Option<String>,
    /// The last readable `archived` event's timestamp.
    pub archive_time: Option<String>,
    /// The task files in `TaskId` order.
    pub tasks: Vec<TaskFile>,
    /// The fold of the change's event files.
    pub state: ChangeState,
    /// The change's status, with the location winning for archived and rejected.
    pub status: ChangeStatus,
    /// The event-derived facts, or `None` without `.run/events/`.
    pub facts: Option<EventFacts>,
    /// The `.run/plan.jsonl` records, in file order.
    pub plan_records: Vec<PlanRecord>,
    /// The manifest's notices record, or `None` when it holds none.
    pub manifest_notices: Option<ManifestNotices>,
    /// The result files' real disclosures, in numeric task order.
    pub disclosures: Vec<TaskDisclosure>,
    /// The delta specs of the change, in capability folder order by bytes.
    pub deltas: Vec<CapabilityDelta>,
    /// The proposal's verify, or empty text when the change has no proposal.
    pub verify: String,
}

/// Reads one change folder into its snapshot.
///
/// Implements: rust-storage/change-snapshot
/// Implements: rust-storage/delta-capabilities
/// Implements: rust-storage/task-plans
/// Implements: rust-storage/task-stream-outcomes
///
/// # Errors
///
/// Returns [`StorageError::Read`] when an event file that exists cannot be
/// read, [`StorageError::EventLine`] when one of its lines is refused, and
/// [`StorageError::Specs`] when a delta spec, a task file or the proposal is
/// refused by the specs kernel.
pub fn read_change(entry: &ChangeEntry) -> Result<ChangeSnapshot, StorageError> {
    let proposal = read_proposal(&entry.path);
    let manifest = read_manifest(&entry.path);
    let approved = is_approved(&entry.path);
    let verify = read_verify(&entry.path)?;
    let deltas = read_deltas(&entry.path)?;
    let tasks = read_task_files(&entry.path)?;
    let task_ids: Vec<TaskId> = tasks.iter().map(|task| task.id.clone()).collect();
    let (state, facts) = read_events(&entry.path, task_ids)?;
    Ok(ChangeSnapshot {
        id: leading_digits(&entry.folder),
        folder: entry.folder.clone(),
        location: entry.location,
        title: proposal.title,
        goal: proposal.goal,
        planner: read_planner(&entry.path, manifest.as_ref()),
        approved,
        approved_at: approved_at(approved, manifest.as_ref()),
        archive_time: facts.as_ref().and_then(|facts| facts.archived_at.clone()),
        tasks: decorate(tasks, facts.as_ref()),
        status: status_of(entry.location, approved, &state),
        state,
        facts,
        plan_records: read_plan_records(&entry.path),
        manifest_notices: manifest_notices(manifest.as_ref()),
        disclosures: read_disclosures(&entry.path),
        deltas,
        verify,
    })
}

/// Reads `.run/plan.jsonl`, treating a missing or unreadable file as no records.
fn read_plan_records(folder: &Path) -> Vec<PlanRecord> {
    fs::read_to_string(folder.join(".run").join("plan.jsonl"))
        .map_or_else(|_| Vec::new(), |text| plan_records(&text))
}

/// Reads every archived change of a project, in listing order.
///
/// Implements: rust-storage/archive-replay
///
/// # Errors
///
/// Returns the first [`StorageError`] an archived change raises.
pub fn read_archive(project_root: &Path) -> Result<Vec<ChangeSnapshot>, StorageError> {
    let mut snapshots = Vec::new();
    for entry in super::list_changes(project_root) {
        if entry.location == Location::Archived {
            snapshots.push(read_change(&entry)?);
        }
    }
    Ok(snapshots)
}

/// Reads every archived change, then every rejected change, in listing order.
///
/// Implements: rust-storage/history-reading
///
/// # Errors
///
/// Returns the first [`StorageError`] a change raises.
pub fn read_history(project_root: &Path) -> Result<Vec<ChangeSnapshot>, StorageError> {
    let mut snapshots = Vec::new();
    for entry in super::list_changes(project_root) {
        if matches!(entry.location, Location::Archived | Location::Rejected) {
            snapshots.push(read_change(&entry)?);
        }
    }
    Ok(snapshots)
}

/// Fills each task's started count and stream outcome from the gathered facts.
fn decorate(mut tasks: Vec<TaskFile>, facts: Option<&EventFacts>) -> Vec<TaskFile> {
    for task in &mut tasks {
        if let Some(facts) = facts {
            task.started = facts.started.get(&task.id).copied().unwrap_or(0);
            if let Some(outcome) = facts.outcomes.get(&task.id) {
                task.outcome = outcome.clone();
            }
        }
    }
    tasks
}

/// The change's status, with an archived or rejected location winning.
fn status_of(location: Location, approved: bool, state: &ChangeState) -> ChangeStatus {
    match location {
        Location::Archived => ChangeStatus::Archived,
        Location::Rejected => ChangeStatus::Rejected,
        Location::Active => change_status(approved, state),
    }
}

/// Whether the change holds the `.run/approved` marker.
fn is_approved(folder: &Path) -> bool {
    folder.join(".run").join("approved").exists()
}

/// The leading digits of a folder name, or an empty string without any.
fn leading_digits(folder: &str) -> String {
    folder.chars().take_while(char::is_ascii_digit).collect()
}
