//! Reading task event files and capability sidecars as TypeScript's report does.
//!
//! Implements: rust-storage/task-event-files
//! Implements: rust-storage/capability-sidecars

use std::fs;
use std::path::Path;

/// One task file and whether its event file exists.
///
/// Implements: rust-storage/task-event-files
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TaskEventFile {
    /// The task id, from its `tasks/<id>.md` name.
    pub id: String,
    /// Whether `.run/events/<id>.jsonl` exists.
    pub events: bool,
}

/// Reads every task file of a change folder with its event-file flag.
///
/// A folder with no `tasks/` gives none.
///
/// Implements: rust-storage/task-event-files
#[must_use]
pub fn read_task_event_files(folder: &Path) -> Vec<TaskEventFile> {
    let Ok(entries) = fs::read_dir(folder.join("tasks")) else {
        return Vec::new();
    };
    let mut ids: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter_map(|name| name.strip_suffix(".md").map(ToOwned::to_owned))
        .collect();
    ids.sort();
    ids.into_iter()
        .map(|id| TaskEventFile {
            events: folder
                .join(".run")
                .join("events")
                .join(format!("{id}.jsonl"))
                .exists(),
            id,
        })
        .collect()
}

/// The living capabilities split by whether each has a sidecar.
///
/// Implements: rust-storage/capability-sidecars
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CapabilitySidecars {
    /// The capabilities whose folder holds `osq.yml`, in byte order.
    pub with_sidecar: Vec<String>,
    /// The capabilities whose folder does not, in byte order.
    pub without_sidecar: Vec<String>,
}

/// Splits a project's living capabilities by whether each has a sidecar.
///
/// A living capability is a folder under `openspec/specs/` holding `spec.md`.
/// With no living capability, this gives `None`.
///
/// Implements: rust-storage/capability-sidecars
#[must_use]
pub fn read_capability_sidecars(root: &Path) -> Option<CapabilitySidecars> {
    let specs = root.join("openspec").join("specs");
    let Ok(entries) = fs::read_dir(specs) else {
        return None;
    };
    let mut living: Vec<(String, bool)> = Vec::new();
    for entry in entries.flatten() {
        if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        let dir = entry.path();
        if !dir.join("spec.md").exists() {
            continue;
        }
        living.push((name, dir.join("osq.yml").exists()));
    }
    if living.is_empty() {
        return None;
    }
    living.sort_by(|left, right| left.0.cmp(&right.0));
    let mut with_sidecar = Vec::new();
    let mut without_sidecar = Vec::new();
    for (name, has_sidecar) in living {
        if has_sidecar {
            with_sidecar.push(name);
        } else {
            without_sidecar.push(name);
        }
    }
    Some(CapabilitySidecars {
        with_sidecar,
        without_sidecar,
    })
}
