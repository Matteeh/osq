//! The Running group's lines.

use std::num::NonZeroU64;
use std::path::Path;

use osq_core::TaskStatus;
use osq_kernel_storage::{ChangeSnapshot, Location, RunningLock, TaskFile};

use super::change_id;

/// The running lines of every live task of an active change.
pub(crate) fn lines(snapshots: &[ChangeSnapshot], now_ms: i64) -> Vec<String> {
    let mut lines = Vec::new();
    for snapshot in snapshots {
        if snapshot.location != Location::Active {
            continue;
        }
        let id = change_id(snapshot);
        let title = snapshot.title.clone().unwrap_or_default();
        for task in &snapshot.tasks {
            let Some(lock) = running_lock(snapshot, task) else {
                continue;
            };
            if !is_live(lock.pid) {
                continue;
            }
            lines.push(line(&id, &title, task, now_ms, lock.started_at_ms));
        }
    }
    lines
}

/// A task's lock when the fold says it is running.
fn running_lock<'a>(snapshot: &'a ChangeSnapshot, task: &'a TaskFile) -> Option<&'a RunningLock> {
    let status = snapshot
        .state
        .tasks()
        .get(&task.id)
        .map_or(TaskStatus::Pending, |state| state.status);
    if status != TaskStatus::Running {
        return None;
    }
    task.markers.lock.as_ref()
}

/// One task's line, with its rounded elapsed time.
fn line(id: &str, title: &str, task: &TaskFile, now_ms: i64, started_at_ms: i64) -> String {
    let seconds = elapsed_seconds(now_ms, started_at_ms);
    let task_title = if task.title.is_empty() {
        format!("{}.md", task.id)
    } else {
        task.title.clone()
    };
    format!(
        "  {id}: {title} — task {}: {task_title} — {} — osq show {id}",
        task.id,
        duration(seconds)
    )
}

/// Whether a pid names a live process: above 0 and `/proc/<pid>` exists.
fn is_live(pid: u64) -> bool {
    NonZeroU64::new(pid).is_some_and(|pid| Path::new(&format!("/proc/{pid}")).exists())
}

/// The elapsed seconds, rounded half up, and 0 when the start is in the future.
fn elapsed_seconds(now_ms: i64, started_at_ms: i64) -> i64 {
    let elapsed_ms = now_ms.saturating_sub(started_at_ms).max(0);
    let seconds = elapsed_ms / 1000;
    let millis = elapsed_ms % 1000;
    seconds + i64::from(millis >= 500)
}

/// The duration text: `0s`, `<s>s`, `<m>m <s>s` or `<m>m`.
fn duration(seconds: i64) -> String {
    let minutes = seconds / 60;
    let rest = seconds % 60;
    if minutes == 0 {
        format!("{seconds}s")
    } else if rest == 0 {
        format!("{minutes}m")
    } else {
        format!("{minutes}m {rest}s")
    }
}
