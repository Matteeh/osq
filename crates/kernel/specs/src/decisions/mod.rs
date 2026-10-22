//! Reading architecture decision records and the capability groups they name.

mod parse;
mod rules;
mod validate;

pub use rules::project_rules_errors;
pub use validate::{DecisionCode, DecisionFinding, DecisionProblems, validate_decisions};

use crate::document::parse_sidecar;
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

/// What an ADR's `applies_to` names: every capability, or a list of names.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(into = "serde_json::Value")]
pub enum AppliesTo {
    /// The ADR applies to every capability.
    All,
    /// The ADR applies to the named capabilities.
    Capabilities(Vec<String>),
}

impl From<AppliesTo> for serde_json::Value {
    /// Writes `all` as the string `all` and the names as a list.
    fn from(value: AppliesTo) -> Self {
        match value {
            AppliesTo::All => Self::String("all".to_string()),
            AppliesTo::Capabilities(names) => Self::from(names),
        }
    }
}

/// One architecture decision record read from the decisions folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Adr {
    /// The file name's leading digits, as written.
    pub number: String,
    /// The first `#` heading without its leading number and dot.
    pub title: String,
    /// The first `YYYY-MM-DD` on the first `Date:` body line.
    pub date: Option<String>,
    /// The decisions-relative path, with forward slashes.
    pub path: String,
    /// `sha256:` and the lowercase hex digest of the file's bytes.
    pub hash: String,
    /// The frontmatter's `status` as text.
    pub status: String,
    /// The `applies_to` value, or none when it is missing or invalid.
    pub applies_to: Option<AppliesTo>,
    /// `applies_to` with each `group:<name>` resolved to its capabilities.
    pub governs: AppliesTo,
    /// The trimmed `rule`.
    pub rule: String,
    /// The trimmed `superseded_by`, or an integer as its text.
    pub superseded_by: Option<String>,
    /// The `checks` paths, with forward slashes and no leading `./`.
    pub checks: Vec<String>,
    /// The `denies` package names.
    pub denies: Vec<String>,
    /// The `enforced_by` values.
    pub enforced_by: Vec<String>,
    /// The list fields that are present but not lists of non-empty strings.
    pub malformed: Vec<String>,
}

/// The parsed decisions folder: ADRs in number order, ignored files and groups.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DecisionRecords {
    /// The ADRs, sorted by number and then by path.
    pub adrs: Vec<Adr>,
    /// The Markdown files that are not ADRs, sorted.
    pub ignored: Vec<String>,
    /// Each capability's sidecar group.
    pub groups: BTreeMap<String, String>,
}

/// Reads the files directly under `<project_root>/<decisions>` into records.
///
/// A `.md` file whose name starts with a digit and whose frontmatter has a
/// `status` key is an ADR; every other `.md` file except `README.md` is
/// ignored. A missing decisions folder reads as no records and no groups.
///
/// Implements: rust-specs/adr-records
pub fn read_decisions(project_root: &Path, decisions: &Path, openspec: &Path) -> DecisionRecords {
    let directory = project_root.join(decisions);
    let Ok(entries) = fs::read_dir(&directory) else {
        return DecisionRecords {
            adrs: Vec::new(),
            ignored: Vec::new(),
            groups: BTreeMap::new(),
        };
    };
    let groups = read_groups(project_root, openspec);
    let prefix = path_text(decisions);
    let prefix = prefix.trim_end_matches('/');
    let mut adrs = Vec::new();
    let mut ignored = Vec::new();

    for entry in entries {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_ok_and(|kind| kind.is_file()) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let markdown = name.as_bytes().ends_with(b".md");
        if !markdown || name == "README.md" {
            continue;
        }
        let relative = join_path(prefix, &name);
        let number: String = name.chars().take_while(char::is_ascii_digit).collect();
        let content = read_utf8(&directory.join(&name));
        let adr = if number.is_empty() {
            None
        } else {
            content
                .as_deref()
                .and_then(|text| parse::parse_adr(text, &number, &relative, &groups))
        };
        match adr {
            Some(adr) => adrs.push(adr),
            None => ignored.push(relative),
        }
    }

    adrs.sort_by(parse::compare_adrs);
    ignored.sort();
    DecisionRecords {
        adrs,
        ignored,
        groups,
    }
}

/// Reads every capability's group: living sidecars first, then active changes.
fn read_groups(project_root: &Path, openspec: &Path) -> BTreeMap<String, String> {
    let openspec = project_root.join(openspec);
    let mut groups = BTreeMap::new();
    let living = openspec.join("specs");
    for capability in capability_folders(&living, true) {
        let sidecar = living.join(&capability).join("osq.yml");
        if let Some(group) = read_sidecar_group(&sidecar) {
            groups.insert(capability, group);
        }
    }

    let changes = openspec.join("changes");
    for change in folder_names(&changes) {
        if !is_active_change(&change) {
            continue;
        }
        let specs = changes.join(&change).join("specs");
        for capability in capability_folders(&specs, false) {
            if groups.contains_key(&capability) {
                continue;
            }
            let sidecar = specs.join(&capability).join("osq.yml");
            if let Some(group) = read_sidecar_group(&sidecar) {
                groups.insert(capability, group);
            }
        }
    }
    groups
}

/// The folders directly under `directory` that hold an `osq.yml`, in name order.
///
/// When `require_spec` is true the folder must also hold a `spec.md`.
fn capability_folders(directory: &Path, require_spec: bool) -> Vec<String> {
    let mut names = Vec::new();
    for name in folder_names(directory) {
        let folder = directory.join(&name);
        if !folder.join("osq.yml").is_file() {
            continue;
        }
        if require_spec && !folder.join("spec.md").is_file() {
            continue;
        }
        names.push(name);
    }
    names
}

/// The names of the folders directly under `directory`, sorted.
fn folder_names(directory: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// True for a change folder that is neither archived nor a draft.
fn is_active_change(name: &str) -> bool {
    !name.starts_with('_') && !name.starts_with('.') && name != "archive" && name != "rejected"
}

/// The group a sidecar names, or none when it is missing or has a problem.
fn read_sidecar_group(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    parse_sidecar(&text).ok().map(|sidecar| sidecar.group)
}

/// Reads a file as UTF-8 text, or none when it cannot be read or is not UTF-8.
fn read_utf8(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    String::from_utf8(bytes).ok()
}

/// A path's text with every backslash turned into a forward slash.
fn path_text(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// Joins a decisions prefix and a file name with one forward slash.
fn join_path(prefix: &str, name: &str) -> String {
    if prefix.is_empty() || prefix == "." {
        name.to_string()
    } else {
        format!("{prefix}/{name}")
    }
}
