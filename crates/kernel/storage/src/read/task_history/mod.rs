//! Reading a task stream's history as TypeScript's report counts it.
//!
//! Implements: rust-storage/task-history
//! Implements: rust-storage/task-sizes
//! Implements: rust-storage/dependencies-added

use std::fs;
use std::path::Path;

mod attempts;
mod costs;
mod dead_reasons;
mod dependencies;
mod pre_spawn;
mod retries;
mod scope;
mod sizes;
pub(crate) mod stream;
mod verify_codes;

pub use dependencies::{DependencyPair, read_dependencies_added};
pub use sizes::{ScopeResolver, TaskSize, read_task_sizes};

/// The attempts, verify runs, retries, costs and scope regressions of one task stream.
///
/// Implements: rust-storage/task-history
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TaskHistory {
    /// The number of `started` events.
    pub attempts: u64,
    /// The `started` events that follow an earlier unexplained one.
    pub unexplained: u64,
    /// One reason per `dead` event, trimmed, or `unknown`.
    pub dead_reasons: Vec<String>,
    /// One exit code per post-spawn `verify_ran` event, or `None`.
    pub verify_codes: Vec<Option<f64>>,
    /// The pre-spawn verify runs and their declared starts.
    pub pre_spawn: PreSpawnHistory,
    /// Every finite event `cost`, in file order.
    pub costs: Vec<f64>,
    /// The attempts holding at least one finite cost.
    pub cost_reported_attempts: u64,
    /// The attempts opened by an automatic `retry` event.
    pub automatic: RetryGroup,
    /// The attempts opened by a manual `retry` event.
    pub manual: RetryGroup,
    /// The number of `stuck` events.
    pub stuck: u64,
    /// The scope regressions and recertifications.
    pub scope: ScopeHistory,
}

/// The pre-spawn verify runs of one task stream.
///
/// Implements: rust-storage/task-history
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PreSpawnHistory {
    /// Every pre-spawn run.
    pub runs: u64,
    /// The runs whose data's `mismatch` is exactly true.
    pub mismatches: u64,
    /// The runs whose data's `missingPaths` is a non-empty array.
    pub missing_path_runs: u64,
    /// The runs whose declared start is `red`.
    pub red: StartCount,
    /// The runs whose declared start is `green`.
    pub green: StartCount,
    /// The runs whose declared start is `any`.
    pub any: StartCount,
}

/// The runs and zero-exit passes of one declared pre-spawn start.
///
/// Implements: rust-storage/task-history
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StartCount {
    /// The runs declaring this start.
    pub runs: u64,
    /// The runs that exited with the number 0.
    pub passed: u64,
}

/// One side of the retry split, automatic or manual.
///
/// Implements: rust-storage/task-history
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RetryGroup {
    /// The retry-opened attempts.
    pub count: u64,
    /// The attempts whose first `done` event was reached.
    pub reached_done: u64,
    /// The sum of the costs inside its attempts.
    pub cost: f64,
    /// The attempts holding at least one finite cost.
    pub cost_reported_attempts: u64,
}

/// The scope-regression detections and recertifications of one task stream.
///
/// Implements: rust-storage/task-history
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ScopeHistory {
    /// The `scope_regression` detections.
    pub detected: u64,
    /// The detections whose exit code is the number 0.
    pub passed_at_detection: u64,
    /// The detections whose exit code is any other number.
    pub failed_at_detection: u64,
    /// The passed recertifications that were not automatic.
    pub recertified_by_human: u64,
    /// The passed recertifications whose `automatic` is exactly true.
    pub recertified_automatically: u64,
    /// The recertifications whose outcome is `requeued`.
    pub requeued_for_agent: u64,
}

/// Reads `task`'s event stream in `folder` as TypeScript's report counts it.
///
/// A missing or unreadable event file gives an all-zero history.
///
/// Implements: rust-storage/task-history
#[must_use]
pub fn read_task_history(folder: &Path, task: &str) -> TaskHistory {
    let path = folder
        .join(".run")
        .join("events")
        .join(format!("{task}.jsonl"));
    let content = fs::read_to_string(path).unwrap_or_default();
    build_history(&content)
}

/// Folds one task stream's parsed lines into its history.
fn build_history(content: &str) -> TaskHistory {
    let events = stream::parse(content);
    let counted_attempts = attempts::count(&events);
    let costs = costs::collect(&events);
    let retries = retries::count(&events);
    TaskHistory {
        attempts: counted_attempts.total,
        unexplained: counted_attempts.unexplained,
        dead_reasons: dead_reasons::collect(&events),
        verify_codes: verify_codes::collect(&events),
        pre_spawn: pre_spawn::count(&events),
        costs: costs.values,
        cost_reported_attempts: costs.reported_attempts,
        automatic: retries.automatic,
        manual: retries.manual,
        stuck: retries.stuck,
        scope: scope::count(&events),
    }
}

/// Whether `content` holds a JSON object line whose `type` is `rejected`.
pub(super) fn has_rejected_line(content: &str) -> bool {
    stream::parse(content)
        .iter()
        .any(|event| event.kind() == Some("rejected"))
}
