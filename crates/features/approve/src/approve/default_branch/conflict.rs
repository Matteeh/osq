//! Reopening the tasks a default-branch conflict touches.

use std::fmt::Write as _;
use std::fs::{self, OpenOptions};
use std::io::Write as _;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::{Envelope, Event, FailureReason, RetryData, event_line};
use osq_core::scope_covers_path;
use osq_kernel_config::Config;
use osq_kernel_specs::read_task_file;
use osq_kernel_storage::ChangeSnapshot;
use osq_kernel_sync::{SyncOutcome, SyncRequest, SyncStop, sync_change_taking_default};

use super::{failed, is_at_or_under, record_commit, record_stop};
use crate::approve::worktree::text::change_id;
use crate::reject::time;

/// One task's id, scope and done marker.
struct Task {
    /// The task's id, as its file name gives it.
    id: String,
    /// The task file's scope entries.
    scope: Vec<String>,
    /// Whether `.run/done/<id>` exists.
    done: bool,
}

/// The conflicted paths split by whether a task's scope can take them.
struct Split {
    /// The paths no task owns, or that lie in the change folder.
    planning: Vec<String>,
    /// The paths a task owns.
    owned: Vec<String>,
}

/// The done tasks a conflict reopens and keeps.
struct Picked {
    /// The reopened tasks, in task order.
    reopened: Vec<String>,
    /// The kept done tasks before the first owning task, in task order.
    kept: Vec<String>,
}

/// What one conflict reopen did.
pub(super) struct Reopened {
    /// The conflicted paths the sync resolved to the default branch.
    paths: Vec<String>,
    /// The tasks the reopen picked.
    picked: Picked,
}

impl Reopened {
    /// The `  Reopened ` line this reopen prints.
    ///
    /// Implements: rust-approve/conflict-reopen
    pub(super) fn line(&self) -> String {
        let mut text = format!(
            "  Reopened {} ({} conflicted)",
            names(&self.picked.reopened),
            self.paths.join(", ")
        );
        if !self.picked.kept.is_empty() {
            let _ = write!(text, "; kept {}", names(&self.picked.kept));
        }
        text
    }
}

/// Handles a `sync_conflict` stop by reopening the tasks that own its paths.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` when a conflicted path
/// needs planning, when the resolving sync stops, or when a marker or event
/// cannot be written.
///
/// Implements: rust-approve/conflict-reopen
pub(super) fn handle(
    change: &Path,
    folder: &str,
    default: &str,
    request: &SyncRequest<'_>,
    stop: &SyncStop,
    snapshot: &ChangeSnapshot,
    config: &Config,
) -> Result<Reopened, FeatureError> {
    let tasks = read_tasks(change, snapshot)?;
    let relative = format!("openspec/changes/{folder}");
    let split = split(&relative, &stop.conflicts, &tasks);
    if !split.planning.is_empty() {
        let message = planning_message(folder, &split.planning, default);
        let planning = SyncStop {
            reason: osq_core::event::SyncStopReason::SyncConflict,
            message,
            conflicts: split.planning,
        };
        return Err(record_stop(change, snapshot, &planning));
    }
    let picked = pick(&tasks, &split.owned);
    match sync_change_taking_default(request, &split.owned) {
        Ok(SyncOutcome::Synced { .. }) => {
            record_commit(request.worktree, config, request.worktree)?;
        }
        Ok(SyncOutcome::AlreadySynced) => {}
        Err(stop) => return Err(record_stop(change, snapshot, &stop)),
    }
    for id in &picked.reopened {
        let ordinal = ordinal(change, id);
        retain_done(change, id, ordinal)?;
        append_retry(change, id, ordinal)?;
    }
    Ok(Reopened {
        paths: stop.conflicts.clone(),
        picked,
    })
}

/// Reads the task files in the order the snapshot gives.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` when a task file cannot
/// be read or parsed.
///
/// Implements: rust-approve/conflict-reopen
fn read_tasks(change: &Path, snapshot: &ChangeSnapshot) -> Result<Vec<Task>, FeatureError> {
    snapshot
        .tasks
        .iter()
        .map(|task| {
            let id = task.id.to_string();
            let path = change.join("tasks").join(format!("{id}.md"));
            let plan = read_task_file(&path).map_err(|error| failed(&error.to_string()))?;
            Ok(Task {
                id,
                scope: plan.scope,
                done: task.done,
            })
        })
        .collect()
}

/// Splits the conflicted paths into planning paths and owned paths.
///
/// Implements: rust-approve/conflict-reopen
fn split(relative: &str, conflicts: &[String], tasks: &[Task]) -> Split {
    let mut split = Split {
        planning: Vec::new(),
        owned: Vec::new(),
    };
    for path in conflicts {
        let owned = !is_at_or_under(relative, path)
            && tasks
                .iter()
                .any(|task| scope_covers_path(&task.scope, path));
        if owned {
            split.owned.push(path.clone());
        } else {
            split.planning.push(path.clone());
        }
    }
    split
}

/// Picks the done tasks from the first owning task on, and the kept ones.
///
/// Implements: rust-approve/conflict-reopen
fn pick(tasks: &[Task], owned: &[String]) -> Picked {
    let mut picked = Picked {
        reopened: Vec::new(),
        kept: Vec::new(),
    };
    let Some(first) = tasks.iter().position(|task| {
        owned
            .iter()
            .any(|path| scope_covers_path(&task.scope, path))
    }) else {
        return picked;
    };
    for (index, task) in tasks.iter().enumerate() {
        if !task.done {
            continue;
        }
        if index >= first {
            picked.reopened.push(task.id.clone());
        } else {
            picked.kept.push(task.id.clone());
        }
    }
    picked
}

/// Names the tasks of `ids` as `task`, `tasks <a> and <b>` or a longer list.
///
/// Implements: rust-approve/conflict-reopen
fn names(ids: &[String]) -> String {
    match ids {
        [] => "no task".to_owned(),
        [one] => format!("task {one}"),
        _ => {
            let (last, before) = ids.split_last().expect("the list has several ids");
            format!("tasks {} and {last}", before.join(", "))
        }
    }
}

/// The stop message for the conflicted paths no task's scope holds.
///
/// Implements: rust-approve/conflict-reopen
fn planning_message(folder: &str, paths: &[String], default: &str) -> String {
    format!(
        "{folder}: {} conflict with {default}, and no task's scope holds them; run osq plan {} so a task owns each file, then approve the revised plan",
        paths.join(", "),
        change_id(folder)
    )
}

/// The next retained name's ordinal for `id`.
///
/// Implements: rust-approve/conflict-reopen
fn ordinal(change: &Path, id: &str) -> u64 {
    let run = change.join(".run");
    retained(&run.join("dead"), id, ".md")
        .max(retained(&run.join("regressed"), id, ".md"))
        .max(retained(&run.join("done"), id, ""))
        + 1
}

/// The highest retained `<id>.<k><suffix>` under `dir`, or zero.
///
/// Implements: rust-approve/conflict-reopen
fn retained(dir: &Path, id: &str, suffix: &str) -> u64 {
    let prefix = format!("{id}.");
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter_map(|name| {
            let rest = name.strip_prefix(&prefix)?;
            rest.strip_suffix(suffix)
                .filter(|digits| digits.bytes().all(|byte| byte.is_ascii_digit()))
                .and_then(|digits| digits.parse().ok())
        })
        .max()
        .unwrap_or(0)
}

/// Renames `.run/done/<id>` to `.run/done/<id>.<ordinal>`.
///
/// Implements: rust-approve/conflict-reopen
fn retain_done(change: &Path, id: &str, ordinal: u64) -> Result<(), FeatureError> {
    let done = change.join(".run").join("done");
    let from = done.join(id);
    let to = done.join(format!("{id}.{ordinal}"));
    fs::rename(&from, &to).map_err(|error| {
        failed(&format!(
            "cannot rename {} to {}: {error}",
            from.display(),
            to.display()
        ))
    })
}

/// Appends the reopened task's `retry` event with the current time.
///
/// Implements: rust-approve/conflict-reopen
fn append_retry(change: &Path, id: &str, ordinal: u64) -> Result<(), FeatureError> {
    let dir = change.join(".run").join("events");
    fs::create_dir_all(&dir).map_err(|error| write_error(&dir, &error))?;
    let envelope = Envelope {
        timestamp: time::now(),
        event: Event::Retry(RetryData {
            target: id.to_owned(),
            reason: FailureReason::SyncConflict,
            attempt: ordinal + 1,
            automatic: None,
        }),
    };
    let path = dir.join(format!("{id}.jsonl"));
    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&path)
        .map_err(|error| write_error(&path, &error))?;
    file.write_all(format!("{}\n", event_line(&envelope)).as_bytes())
        .map_err(|error| write_error(&path, &error))
}

/// The failed error for a path that could not be written.
///
/// Implements: rust-approve/conflict-reopen
fn write_error(path: &Path, error: &std::io::Error) -> FeatureError {
    failed(&format!("cannot write {}: {error}", path.display()))
}
