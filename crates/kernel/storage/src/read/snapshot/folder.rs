//! Reading a change folder's proposal, brief, manifest, tasks and markers.

use std::fs;
use std::path::Path;

use osq_core::TaskId;
use serde_json::Value;

use crate::read::StorageError;
use crate::read::text::{frontmatter_string, goal_section, markdown_body, timestamp_ms};

use super::TaskFile;
use super::outcomes::TaskOutcomeFacts;

/// The parts of a proposal storage reads: its title and its Goal.
pub(super) struct Proposal {
    /// The frontmatter title, trimmed, or `None`.
    pub(super) title: Option<String>,
    /// The `## Goal` section, trimmed, or `None`.
    pub(super) goal: Option<String>,
}

/// Reads the proposal's title and Goal, tolerating a missing proposal.
pub(super) fn read_proposal(folder: &Path) -> Proposal {
    let Some(text) = read_text(&folder.join("proposal.md")) else {
        return Proposal {
            title: None,
            goal: None,
        };
    };
    Proposal {
        title: frontmatter_string(&text, "title")
            .as_deref()
            .and_then(trimmed),
        goal: goal_section(markdown_body(&text))
            .as_deref()
            .and_then(trimmed),
    }
}

/// Reads the manifest as an object, or `None` when it is missing or malformed.
pub(super) fn read_manifest(folder: &Path) -> Option<Value> {
    let text = read_text(&folder.join(".run").join("manifest.json"))?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value.is_object().then_some(value)
}

/// The manifest `approvedAt` when the change is approved and it reads.
pub(super) fn approved_at(approved: bool, manifest: Option<&Value>) -> Option<String> {
    if !approved {
        return None;
    }
    let value = manifest?.get("approvedAt")?.as_str()?;
    timestamp_ms(value).is_some().then(|| value.to_owned())
}

/// The planner the manifest names, else the brief's, both trimmed.
pub(super) fn read_planner(folder: &Path, manifest: Option<&Value>) -> Option<String> {
    let from_manifest = manifest
        .and_then(|value| value.get("planner"))
        .and_then(Value::as_str)
        .and_then(trimmed);
    if from_manifest.is_some() {
        return from_manifest;
    }
    let brief = read_text(&folder.join("brief.md"))?;
    frontmatter_string(&brief, "planner")
        .as_deref()
        .and_then(trimmed)
}

/// Reads every `tasks/<n>.md` file, in task id order, with its specs kernel plan.
///
/// # Errors
///
/// Returns [`StorageError::Specs`] when the specs kernel refuses a task file.
pub(super) fn read_task_files(folder: &Path) -> Result<Vec<TaskFile>, StorageError> {
    let Ok(entries) = fs::read_dir(folder.join("tasks")) else {
        return Ok(Vec::new());
    };
    let mut tasks: Vec<TaskFile> = Vec::new();
    for entry in entries.flatten() {
        if let Some(task) = task_file(folder, &entry.path())? {
            tasks.push(task);
        }
    }
    tasks.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(tasks)
}

/// Builds one task file from its path, or `None` for a name that is not `<n>.md`.
fn task_file(folder: &Path, path: &Path) -> Result<Option<TaskFile>, StorageError> {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return Ok(None);
    };
    let Some(id) = name.strip_suffix(".md") else {
        return Ok(None);
    };
    let plan = osq_kernel_specs::read_task_file(path).map_err(StorageError::Specs)?;
    Ok(Some(TaskFile {
        title: task_title(path),
        done: is_done(folder, id),
        id: TaskId::new(id),
        started: 0,
        plan,
        outcome: TaskOutcomeFacts::default(),
    }))
}

/// A task file's frontmatter title, trimmed, or empty text.
fn task_title(path: &Path) -> String {
    let Some(text) = read_text(path) else {
        return String::new();
    };
    frontmatter_string(&text, "title")
        .as_deref()
        .and_then(trimmed)
        .unwrap_or_default()
}

/// Whether the task's `.run/done/<n>` marker exists.
fn is_done(folder: &Path, task: &str) -> bool {
    folder.join(".run").join("done").join(task).exists()
}

/// Reads a file as text, treating every failure as absent.
fn read_text(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

/// Trims a string, giving `None` when the result is empty.
fn trimmed(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// Reads an event file strictly, naming it when it cannot be read.
pub(super) fn read_events_file(path: &Path) -> Result<String, StorageError> {
    fs::read_to_string(path).map_err(|source| StorageError::Read {
        path: path.to_path_buf(),
        source,
    })
}
