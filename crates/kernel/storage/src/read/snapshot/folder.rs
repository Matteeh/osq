//! Reading a change folder's proposal, brief, manifest, tasks and markers.

use std::fs;
use std::path::Path;

use osq_core::TaskId;

use crate::read::StorageError;
use crate::read::text::{frontmatter_string, goal_section, markdown_body, timestamp_ms};

use super::TaskFile;
use super::manifest::Manifest;
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

/// Reads `.run/manifest.json` into its typed fields, or `None` when it is missing.
///
/// # Errors
///
/// Returns [`StorageError::Read`] when the file exists but cannot be read as
/// text, and [`StorageError::Manifest`] when its text does not read as a
/// manifest.
pub(super) fn read_manifest(folder: &Path) -> Result<Option<Manifest>, StorageError> {
    let path = folder.join(".run").join("manifest.json");
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(source) => return Err(StorageError::Read { path, source }),
    };
    serde_json::from_str(&text)
        .map(Some)
        .map_err(|source| StorageError::Manifest { path, source })
}

/// The manifest `approvedAt` when the change is approved and it reads.
pub(super) fn approved_at(approved: bool, manifest: Option<&Manifest>) -> Option<String> {
    if !approved {
        return None;
    }
    let value = manifest?.approved_at.as_deref()?;
    timestamp_ms(value).is_some().then(|| value.to_owned())
}

/// The planner the manifest names, else the brief's, both trimmed.
pub(super) fn read_planner(folder: &Path, manifest: Option<&Manifest>) -> Option<String> {
    let from_manifest = manifest
        .and_then(|manifest| manifest.planner.as_deref())
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
