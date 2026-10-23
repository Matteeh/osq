//! Reading a change folder into the facts one land needs for its message.
//!
//! Every rule mirrors TypeScript's `buildSquashMessage` and the readers beside
//! it, and never fails: missing files and unusable lines are passed over.
//!
//! Implements: rust-storage/land-facts

use std::fs;
use std::path::Path;

use osq_kernel_specs::{ChecklistItem, parse_frontmatter, parse_task_list};
use serde_json::Value;
use yaml_rust2::Yaml;

use super::text::{goal_section, markdown_body, timestamp_ms};

/// The facts a land needs from one change folder.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LandFacts {
    /// The proposal's `## Goal` section, or empty text.
    pub goal: String,
    /// The items of `tasks.md`, in their order.
    pub tasks: Vec<LandTask>,
    /// The trimmed `.run/base`, when it is not empty.
    pub base: Option<String>,
    /// The trimmed `.run/approved`, when it is not empty.
    pub approved: Option<String>,
    /// The trimmed `.run/approver`, when it is not empty.
    pub approver: Option<String>,
    /// The last usable `archived` event's timestamp.
    pub archived_at: Option<String>,
    /// The capability names under `specs/`, sorted.
    pub capabilities: Vec<String>,
    /// The folder names `.run/stacked-on` declares, in file order.
    pub stacked_on: Vec<String>,
}

/// One `tasks.md` item with its manual marker and last started event.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LandTask {
    /// The item's number, else its 1-based position.
    pub number: u32,
    /// The item's title.
    pub title: String,
    /// Whether `.run/done/<number>` holds the boolean `manual: true`.
    pub manual: bool,
    /// `<harness> <model>` from the last usable `started` event.
    pub model: Option<String>,
    /// The `osqVersion` of that event.
    pub version: Option<String>,
}

/// Reads a change folder into the facts one land needs, never failing.
///
/// Implements: rust-storage/land-facts
#[must_use]
pub fn read_land_facts(folder: &Path) -> LandFacts {
    LandFacts {
        goal: read_goal(folder),
        tasks: read_tasks(folder),
        base: read_trimmed(&folder.join(".run").join("base")),
        approved: read_trimmed(&folder.join(".run").join("approved")),
        approver: read_trimmed(&folder.join(".run").join("approver")),
        archived_at: read_archived_at(folder),
        capabilities: read_capabilities(folder),
        stacked_on: read_stacked_on(folder),
    }
}

/// The proposal's Goal, or empty text without one.
///
/// Implements: rust-storage/land-facts
fn read_goal(folder: &Path) -> String {
    let Some(text) = read_text(&folder.join("proposal.md")) else {
        return String::new();
    };
    goal_section(markdown_body(&text)).unwrap_or_default()
}

/// The `tasks.md` items with their markers and streams.
///
/// Implements: rust-storage/land-facts
fn read_tasks(folder: &Path) -> Vec<LandTask> {
    let Some(text) = read_text(&folder.join("tasks.md")) else {
        return Vec::new();
    };
    parse_task_list(&text)
        .iter()
        .enumerate()
        .map(|(index, item)| land_task(folder, item, index))
        .collect()
}

/// One checklist item with its number, manual marker and started event.
///
/// Implements: rust-storage/land-facts
fn land_task(folder: &Path, item: &ChecklistItem, index: usize) -> LandTask {
    let position = u32::try_from(index + 1).unwrap_or(u32::MAX);
    let number = item.number.unwrap_or(position);
    let (model, version) = read_started(folder, number);
    LandTask {
        number,
        title: item.title.clone(),
        manual: read_manual(folder, number),
        model,
        version,
    }
}

/// Whether `.run/done/<number>` holds the boolean `manual: true`.
///
/// Implements: rust-storage/land-facts
fn read_manual(folder: &Path, number: u32) -> bool {
    let path = folder.join(".run").join("done").join(number.to_string());
    let Some(text) = read_text(&path) else {
        return false;
    };
    parse_frontmatter(&text).is_ok_and(|frontmatter| {
        matches!(
            frontmatter.data.get(&Yaml::String(String::from("manual"))),
            Some(Yaml::Boolean(true))
        )
    })
}

/// The model and version of the last usable `started` line, if any.
///
/// Implements: rust-storage/land-facts
fn read_started(folder: &Path, number: u32) -> (Option<String>, Option<String>) {
    let path = folder
        .join(".run")
        .join("events")
        .join(format!("{number}.jsonl"));
    let Some(text) = read_text(&path) else {
        return (None, None);
    };
    let mut found = None;
    for line in text.split('\n') {
        if let Some(started) = started_line(line) {
            found = Some(started);
        }
    }
    match found {
        Some((harness, model, version)) => (Some(format!("{harness} {model}")), Some(version)),
        None => (None, None),
    }
}

/// The harness, model and osq version of one usable `started` line.
///
/// Implements: rust-storage/land-facts
fn started_line(line: &str) -> Option<(String, String, String)> {
    let event: Value = serde_json::from_str(line).ok()?;
    let record = event.as_object()?;
    if record.get("type")?.as_str()? != "started" {
        return None;
    }
    let data = record.get("data")?.as_object()?;
    let harness = data.get("harness")?.as_str()?.to_owned();
    let model = data.get("model")?.as_str()?.to_owned();
    let version = data.get("osqVersion")?.as_str()?.to_owned();
    Some((harness, model, version))
}

/// The timestamp of the last usable `archived` line, if any.
///
/// Implements: rust-storage/land-facts
fn read_archived_at(folder: &Path) -> Option<String> {
    let path = folder.join(".run").join("events").join("change.jsonl");
    let text = read_text(&path)?;
    let mut found = None;
    for line in text.split('\n') {
        if let Some(timestamp) = archived_line(line) {
            found = Some(timestamp);
        }
    }
    found
}

/// The timestamp of one usable `archived` line, if any.
///
/// Implements: rust-storage/land-facts
fn archived_line(line: &str) -> Option<String> {
    let event: Value = serde_json::from_str(line).ok()?;
    let record = event.as_object()?;
    if record.get("type")?.as_str()? != "archived" {
        return None;
    }
    let timestamp = record.get("timestamp")?.as_str()?;
    timestamp_ms(timestamp).map(|_| timestamp.to_owned())
}

/// The sorted names of the directories directly under `specs/`.
///
/// Implements: rust-storage/land-facts
fn read_capabilities(folder: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(folder.join("specs")) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    names.sort();
    names
}

/// The first word of each `.run/stacked-on` line holding two or more words.
///
/// Implements: rust-storage/land-facts
fn read_stacked_on(folder: &Path) -> Vec<String> {
    let Some(text) = read_text(&folder.join(".run").join("stacked-on")) else {
        return Vec::new();
    };
    text.split('\n')
        .filter_map(|line| {
            let mut words = line.split_whitespace();
            let first = words.next()?;
            words.next()?;
            Some(first.to_owned())
        })
        .collect()
}

/// Reads a file as text, treating every failure as absent.
///
/// Implements: rust-storage/land-facts
fn read_text(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

/// Reads a file's trimmed text, treating blank or absent text as none.
///
/// Implements: rust-storage/land-facts
fn read_trimmed(path: &Path) -> Option<String> {
    let text = read_text(path)?;
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}
