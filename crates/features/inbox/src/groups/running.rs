//! The Running group's lines.

use std::collections::HashSet;
use std::num::NonZeroU64;
use std::path::Path;

use osq_core::TaskStatus;
use osq_kernel_storage::{
    ChangeSnapshot, Location, PauseRecord, RunningLock, TaskFile, timestamp_ms,
};

use super::{change_id, compare_ids};

/// One Running group item before it is rendered.
struct Item {
    /// The change id.
    id: String,
    /// The task id as written.
    task: String,
    /// The item's one rendered line.
    line: String,
}

/// The running and paused lines, sorted by change id then task id.
pub(crate) fn lines(
    snapshots: &[ChangeSnapshot],
    pauses: &[Option<PauseRecord>],
    now_ms: i64,
) -> Vec<String> {
    let mut items = Vec::new();
    let mut running_keys = HashSet::new();
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
            running_keys.insert((id.clone(), task.id.as_str().to_owned()));
            items.push(Item {
                id: id.clone(),
                task: task.id.as_str().to_owned(),
                line: running_line(&id, &title, task, now_ms, lock.started_at_ms),
            });
        }
    }
    for (snapshot, pause) in snapshots.iter().zip(pauses) {
        let Some(pause) = pause else {
            continue;
        };
        if snapshot.location != Location::Active || !snapshot.approved {
            continue;
        }
        if timestamp_ms(&pause.until).is_none_or(|until| until <= now_ms) {
            continue;
        }
        let Some(task) = snapshot
            .tasks
            .iter()
            .find(|task| task.id.as_str() == pause.task)
        else {
            continue;
        };
        let id = change_id(snapshot);
        if running_keys.contains(&(id.clone(), task.id.as_str().to_owned())) {
            continue;
        }
        let title = snapshot.title.clone().unwrap_or_default();
        let rendered = paused_line(&id, &title, task, &pause.until);
        items.push(Item {
            id,
            task: task.id.as_str().to_owned(),
            line: rendered,
        });
    }
    items.sort_by(|left, right| {
        compare_ids(&left.id, &right.id).then_with(|| compare_ids(&left.task, &right.task))
    });
    items.into_iter().map(|item| item.line).collect()
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

/// One running task's line, with its rounded elapsed time.
fn running_line(id: &str, title: &str, task: &TaskFile, now_ms: i64, started_at_ms: i64) -> String {
    let seconds = elapsed_seconds(now_ms, started_at_ms);
    format!(
        "{} — {} — osq show {id}",
        head(id, title, task),
        duration(seconds)
    )
}

/// One paused task's line, with its fixed-form resume time.
fn paused_line(id: &str, title: &str, task: &TaskFile, until: &str) -> String {
    format!(
        "{} — paused until {} UTC — osq show {id}",
        head(id, title, task),
        pause_until(until)
    )
}

/// A running or paused item's change and task head.
fn head(id: &str, title: &str, task: &TaskFile) -> String {
    let task_title = if task.title.is_empty() {
        format!("{}.md", task.id)
    } else {
        task.title.clone()
    };
    format!("  {id}: {title} — task {}: {task_title}", task.id)
}

/// A fixed-form timestamp as `<day> <time>`, both in UTC.
fn pause_until(until: &str) -> String {
    let day: String = until.chars().take(10).collect();
    let time = until
        .split_once('T')
        .map(|(_, rest)| rest.chars().take(5).collect::<String>())
        .unwrap_or_default();
    format!("{day} {time}")
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
