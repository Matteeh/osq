//! Reading the files the land view prints besides the event timeline.
//!
//! Implements: rust-show/show-text

use std::fs;
use std::path::Path;

use osq_kernel_specs::{parse_delta, parse_frontmatter, read_proposal};
use serde_json::Value;
use yaml_rust2::Yaml;

use crate::model::Change;

/// The proposal's change-level verify and declared check command.
pub(super) struct Commands {
    /// The trimmed proposal verify, or empty text.
    pub(super) verify: String,
    /// The trimmed `check` frontmatter value, when non-empty.
    pub(super) check: Option<String>,
}

/// One delta capability and its requirement counts.
pub(super) struct Capability {
    /// The capability folder's name.
    pub(super) name: String,
    /// The added requirement count.
    pub(super) added: usize,
    /// The modified requirement count.
    pub(super) modified: usize,
    /// The removed requirement count.
    pub(super) removed: usize,
    /// The renamed requirement count.
    pub(super) renamed: usize,
}

/// One result file with a real deviated or outside-scope section.
pub(super) struct Disclosure {
    /// The result file's task name.
    pub(super) task: String,
    /// Whether the result holds a real `## Deviated` section.
    pub(super) deviated: bool,
    /// Whether the result holds a real `## Outside scope` section.
    pub(super) outside_scope: bool,
}

/// One change-level halt marker's facts.
pub(super) struct Halt {
    /// The trimmed `reason` string, when non-empty.
    pub(super) reason: Option<String>,
    /// The trimmed body.
    pub(super) message: String,
}

/// The last sync that stopped after the last completed sync.
pub(super) struct SyncStop {
    /// The event's `reason` string.
    pub(super) reason: String,
    /// The event's `message` string, as written.
    pub(super) message: String,
}

/// The proposal's change-level verify and declared check command.
///
/// Implements: rust-show/show-text
pub(super) fn commands(change: &Change) -> Commands {
    let path = change.path.join("proposal.md");
    let text = fs::read_to_string(&path).unwrap_or_default();
    let verify = read_proposal(&path)
        .map(|proposal| proposal.verify)
        .unwrap_or_default();
    let check = parse_frontmatter(&text).ok().and_then(|frontmatter| {
        frontmatter
            .data
            .get(&Yaml::String("check".to_owned()))
            .and_then(Yaml::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    });
    Commands { verify, check }
}

/// The change's delta capabilities, in capability name order.
///
/// Implements: rust-show/show-text
pub(super) fn capabilities(change: &Change) -> Vec<Capability> {
    let dir = change.path.join("specs");
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    names.sort();
    names
        .into_iter()
        .filter_map(|name| {
            let path = change.path.join("specs").join(&name).join("spec.md");
            let text = fs::read_to_string(path).ok()?;
            let delta = parse_delta(&text);
            Some(Capability {
                name,
                added: delta.added.len(),
                modified: delta.modified.len(),
                removed: delta.removed.len(),
                renamed: delta.renamed.len(),
            })
        })
        .collect()
}

/// The result files with a real deviated or outside-scope section.
///
/// Implements: rust-show/show-text
pub(super) fn disclosures(change: &Change) -> Vec<Disclosure> {
    let dir = change.path.join(".run").join("results");
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<(u64, String)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let number = result_number(&name)?;
            Some((number, name))
        })
        .collect();
    files.sort_by_key(|(number, _)| *number);
    files
        .into_iter()
        .filter_map(|(_, name)| disclosure(&change.path, &name))
        .collect()
}

/// The numeric name of a `<n>.md` result file.
fn result_number(name: &str) -> Option<u64> {
    let stem = name.strip_suffix(".md")?;
    if !stem.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    stem.parse().ok()
}

/// One result file's disclosure, or none when it holds none.
fn disclosure(folder: &Path, name: &str) -> Option<Disclosure> {
    let path = folder.join(".run").join("results").join(name);
    let text = fs::read_to_string(path).ok()?;
    let sections = osq_kernel_storage::parse_result_sections(&text);
    if sections.deviated.is_none() && sections.outside_scope.is_none() {
        return None;
    }
    Some(Disclosure {
        task: name.strip_suffix(".md").unwrap_or(name).to_owned(),
        deviated: sections.deviated.is_some(),
        outside_scope: sections.outside_scope.is_some(),
    })
}

/// The last `sync_stopped` event recorded after the last `synced` event.
///
/// Malformed lines and events with missing string or number fields are passed
/// over, as TypeScript's `readLastSync` does.
///
/// Implements: rust-show/show-land-lines
pub(super) fn sync_stop(change: &Change) -> Option<SyncStop> {
    let path = change.path.join(".run").join("events").join("change.jsonl");
    let text = fs::read_to_string(path).ok()?;
    let mut sync_index = None;
    let mut stop = None;
    for (index, line) in text.split('\n').enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(Value::Object(event)) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("synced") if is_sync(&event) => sync_index = Some(index),
            Some("sync_stopped") => {
                if let Some(found) = stop_event(&event) {
                    stop = Some((index, found));
                }
            }
            _ => {}
        }
    }
    let (index, found) = stop?;
    stop_after(sync_index, index).then_some(found)
}

/// Whether a stop comes after the last completed sync, or there is none.
#[cfg_attr(docsrs, mutants::skip)]
fn stop_after(sync_index: Option<usize>, stop_index: usize) -> bool {
    sync_index.is_none_or(|sync| stop_index > sync)
}

/// Whether one `synced` event holds a timestamp, default branch and commit count.
fn is_sync(event: &serde_json::Map<String, Value>) -> bool {
    event.get("timestamp").is_some_and(Value::is_string)
        && data(event).is_some_and(|data| {
            data.get("defaultBranch").is_some_and(Value::is_string)
                && data.get("commits").is_some_and(Value::is_number)
        })
}

/// One `sync_stopped` event's reason and message, or none when either is missing.
fn stop_event(event: &serde_json::Map<String, Value>) -> Option<SyncStop> {
    event.get("timestamp").filter(|value| value.is_string())?;
    let data = data(event)?;
    Some(SyncStop {
        reason: data.get("reason")?.as_str()?.to_owned(),
        message: data.get("message")?.as_str()?.to_owned(),
    })
}

/// One event's plain-object `data`, or none when it is not an object.
fn data(event: &serde_json::Map<String, Value>) -> Option<&serde_json::Map<String, Value>> {
    event.get("data")?.as_object()
}

/// The change-level halt marker, or none when it is absent.
///
/// Implements: rust-show/show-text
pub(super) fn halt(change: &Change) -> Option<Halt> {
    let path = change.path.join(".run").join("regressed").join("change.md");
    let text = fs::read_to_string(path).ok()?;
    let (reason, body) = match parse_frontmatter(&text) {
        Ok(frontmatter) => (
            frontmatter
                .data
                .get(&Yaml::String("reason".to_owned()))
                .and_then(Yaml::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned),
            frontmatter.body,
        ),
        Err(_) => (None, text),
    };
    Some(Halt {
        reason,
        message: body.trim().to_owned(),
    })
}
