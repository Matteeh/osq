//! Reading the files the land view prints besides the event timeline.
//!
//! Implements: rust-show/show-text

use std::fs;
use std::path::Path;

use osq_kernel_specs::{parse_delta, parse_frontmatter, read_proposal};
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
