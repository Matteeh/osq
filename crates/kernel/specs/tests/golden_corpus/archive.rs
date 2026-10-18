//! The archived documents of every change folder, against the four goldens.

use super::scan::{add_file, add_markdown, add_specs, file_name, leading_number};
use crate::golden_support::{
    delta_entry, digest, first_difference, proposal_entry, read_golden, task_entry, task_list_entry,
};
use osq_kernel_specs::{read_delta, read_proposal, read_task_file, read_task_list};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// The highest archived change number the goldens cover.
const LAST_ARCHIVED: u32 = 214;

/// Every failure the archived documents show against the four goldens.
#[must_use]
pub fn archive_failures(root: &Path) -> Vec<String> {
    let documents = archived_documents(root);
    let mut failures = Vec::new();
    compare_kind(
        "delta",
        "deltas.json",
        &documents.deltas,
        delta_value,
        &mut failures,
    );
    compare_kind(
        "task",
        "tasks.json",
        &documents.tasks,
        task_value,
        &mut failures,
    );
    compare_kind(
        "proposal",
        "proposals.json",
        &documents.proposals,
        proposal_value,
        &mut failures,
    );
    compare_kind(
        "task list",
        "task_lists.json",
        &documents.task_lists,
        task_list_value,
        &mut failures,
    );
    failures
}

/// The archived change folders up to `LAST_ARCHIVED`, in name order.
fn archived_folders(root: &Path) -> Vec<PathBuf> {
    let archive = root.join("openspec/changes/archive");
    let entries = std::fs::read_dir(&archive)
        .unwrap_or_else(|error| panic!("{}: {error}", archive.display()));
    let mut folders: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .filter(|path| {
            leading_number(&file_name(path)).is_some_and(|number| number <= LAST_ARCHIVED)
        })
        .collect();
    folders.sort();
    folders
}

/// The archived documents of each kind, by relative path.
#[derive(Default)]
struct Archived {
    /// Every delta spec.
    deltas: BTreeMap<String, PathBuf>,
    /// Every task file.
    tasks: BTreeMap<String, PathBuf>,
    /// Every proposal.
    proposals: BTreeMap<String, PathBuf>,
    /// Every `tasks.md`.
    task_lists: BTreeMap<String, PathBuf>,
}

/// The corpus documents of every archived folder, keyed by relative path.
fn archived_documents(root: &Path) -> Archived {
    let mut documents = Archived::default();
    for folder in archived_folders(root) {
        let base = format!("openspec/changes/archive/{}", file_name(&folder));
        add_file(
            &folder.join("proposal.md"),
            &base,
            "proposal.md",
            &mut documents.proposals,
        );
        add_file(
            &folder.join("tasks.md"),
            &base,
            "tasks.md",
            &mut documents.task_lists,
        );
        add_markdown(&folder.join("tasks"), &base, "tasks", &mut documents.tasks);
        add_specs(&folder.join("specs"), &base, &mut documents.deltas);
    }
    documents
}

/// Compares one golden file's entries with the documents the corpus found.
fn compare_kind(
    kind: &str,
    golden_name: &str,
    found: &BTreeMap<String, PathBuf>,
    parse: impl Fn(&str, &Path) -> Value,
    failures: &mut Vec<String>,
) {
    let expected = golden_entries(&read_golden(golden_name));
    for (path, want) in &expected {
        match found.get(path) {
            Some(file) => {
                if let Some(difference) = first_difference(want, &parse(path, file)) {
                    failures.push(format!("{kind} {path}: {difference}"));
                }
            }
            None => failures.push(format!("{kind} {path}: missing from the corpus")),
        }
    }
    for path in found.keys() {
        if !expected.contains_key(path) {
            failures.push(format!("{kind} {path}: not in the golden"));
        }
    }
}

/// The golden file's entries, keyed by their `path`.
fn golden_entries(golden: &Value) -> BTreeMap<String, Value> {
    let mut entries = BTreeMap::new();
    for entry in golden.as_array().into_iter().flatten() {
        if let Some(path) = entry.get("path").and_then(Value::as_str) {
            entries.insert(path.to_string(), entry.clone());
        }
    }
    entries
}

/// A stand-in value for a document that does not read.
fn error_value(message: &str) -> Value {
    let mut fields = Map::new();
    fields.insert(
        "parse_error".to_string(),
        Value::String(message.to_string()),
    );
    Value::Object(fields)
}

/// Digests a delta spec's golden entry, or reports a read error.
fn delta_value(path: &str, file: &Path) -> Value {
    match read_delta(file) {
        Ok(delta) => digest(&delta_entry(path, &delta)),
        Err(error) => error_value(&error.to_string()),
    }
}

/// Digests a task file's golden entry, or reports a read error.
fn task_value(path: &str, file: &Path) -> Value {
    match read_task_file(file) {
        Ok(task) => digest(&task_entry(path, &task)),
        Err(error) => error_value(&error.to_string()),
    }
}

/// Digests a proposal's golden entry, or reports a read error.
fn proposal_value(path: &str, file: &Path) -> Value {
    match read_proposal(file) {
        Ok(proposal) => digest(&proposal_entry(path, &proposal)),
        Err(error) => error_value(&error.to_string()),
    }
}

/// Digests a `tasks.md` golden entry, or reports a read error.
fn task_list_value(path: &str, file: &Path) -> Value {
    match read_task_list(file) {
        Ok(items) => digest(&task_list_entry(path, &items)),
        Err(error) => error_value(&error.to_string()),
    }
}
