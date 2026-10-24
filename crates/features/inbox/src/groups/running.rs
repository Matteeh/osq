//! The Running group's items.

use std::collections::HashSet;
use std::num::NonZeroU64;
use std::path::Path;

use osq_core::TaskStatus;
use osq_kernel_storage::{
    ChangeSnapshot, Location, PauseRecord, RunningLock, TaskFile, timestamp_ms,
};

use super::{change_id, compare_ids};
use crate::needs::TaskRef;

/// How a Running group item waits.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum State {
    /// A live running task, with its lock facts.
    Running {
        /// The lock's pid.
        pid: u64,
        /// The lock's start time, epoch milliseconds.
        started_at_ms: i64,
        /// The rounded seconds since the start.
        elapsed_seconds: i64,
    },
    /// A paused task, with the time it may run again as written.
    Paused {
        /// The pause's `until`.
        until: String,
    },
}

/// One Running group item: the facts both its line and its JSON object print.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Item {
    /// The change id.
    pub(crate) id: String,
    /// The change title.
    pub(crate) title: String,
    /// The task the item names.
    pub(crate) task: TaskRef,
    /// How the item waits.
    pub(crate) state: State,
}

impl Item {
    /// The item's one rendered line.
    pub(crate) fn line(&self) -> String {
        let head = format!(
            "  {}: {} — task {}: {}",
            self.id, self.title, self.task.number, self.task.title
        );
        match &self.state {
            State::Running {
                elapsed_seconds, ..
            } => format!(
                "{head} — {} — osq show {}",
                duration(*elapsed_seconds),
                self.id
            ),
            State::Paused { until } => format!(
                "{head} — paused until {} UTC — osq show {}",
                pause_until(until),
                self.id
            ),
        }
    }
}

/// The running and paused items, sorted by change id then task id.
///
/// Implements: rust-inbox/running-items
/// Implements: rust-inbox/paused-items
pub(crate) fn items(
    snapshots: &[ChangeSnapshot],
    pauses: &[Option<PauseRecord>],
    now_ms: i64,
) -> Vec<Item> {
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
                title: title.clone(),
                task: task_ref(task),
                state: State::Running {
                    pid: lock.pid,
                    started_at_ms: lock.started_at_ms,
                    elapsed_seconds: elapsed_seconds(now_ms, lock.started_at_ms),
                },
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
        items.push(Item {
            id,
            title: snapshot.title.clone().unwrap_or_default(),
            task: task_ref(task),
            state: State::Paused {
                until: pause.until.clone(),
            },
        });
    }
    items.sort_by(|left, right| {
        compare_ids(&left.id, &right.id)
            .then_with(|| compare_ids(&left.task.number, &right.task.number))
    });
    items
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

/// A task's id and the title the item prints for it.
fn task_ref(task: &TaskFile) -> TaskRef {
    TaskRef {
        number: task.id.as_str().to_owned(),
        title: if task.title.is_empty() {
            format!("{}.md", task.id)
        } else {
            task.title.clone()
        },
    }
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
