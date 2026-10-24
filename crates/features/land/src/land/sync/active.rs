//! Picking the done tasks an active sync verifies and recertifies.

use std::cmp::Ordering;
use std::path::Path;

use osq_kernel_specs::read_task_file;
use osq_kernel_storage::{DoneScope, read_done_scope, read_now_facts, task_scope_hash};

/// One done task whose verify an active sync runs.
#[derive(Clone, Debug)]
pub(crate) struct Picked {
    /// The task's id.
    pub(crate) id: String,
    /// The task file's verify command.
    pub(crate) verify: String,
    /// The task file's scope entries.
    pub(crate) scope: Vec<String>,
    /// The done marker's scope, when the marker matches the pre-merge tree.
    pub(crate) recorded: Option<DoneScope>,
}

/// Every done, non-manual task with a verify, in numeric task order.
///
/// A task whose file does not read is passed over. The pre-merge scope hash is
/// compared with the marker's, and a matching marker is kept for recertifying.
///
/// Implements: rust-land/active-sync
pub(crate) fn pick(change: &Path, worktree: &Path) -> Vec<Picked> {
    let facts = read_now_facts(change);
    let mut picked: Vec<Picked> = facts
        .tasks
        .into_iter()
        .filter(|task| task.done && !task.regressed && !task.manual)
        .filter_map(|task| one(change, worktree, &task.id))
        .collect();
    picked.sort_by(|left, right| order(&left.id, &right.id));
    picked
}

/// One task's verify and matching done scope, or none when it cannot run.
///
/// Implements: rust-land/active-sync
fn one(change: &Path, worktree: &Path, id: &str) -> Option<Picked> {
    let task = read_task_file(&change.join("tasks").join(format!("{id}.md"))).ok()?;
    if task.verify.is_empty() {
        return None;
    }
    let recorded = read_done_scope(change, id)
        .filter(|scope| task_scope_hash(worktree, &task.scope).hash == scope.scope_hash);
    Some(Picked {
        id: id.to_owned(),
        verify: task.verify,
        scope: task.scope,
        recorded,
    })
}

/// Orders two task ids numerically, falling back to their bytes.
///
/// Implements: rust-land/active-sync
fn order(left: &str, right: &str) -> Ordering {
    match (left.parse::<u64>(), right.parse::<u64>()) {
        (Ok(left_number), Ok(right_number)) => {
            left_number.cmp(&right_number).then_with(|| left.cmp(right))
        }
        _ => left.cmp(right),
    }
}
