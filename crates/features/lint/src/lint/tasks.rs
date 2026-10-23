//! TypeScript's task rules: each task file's frontmatter, acceptance lines,
//! tests gate, verify command, limits and brace groups, then the cross-task
//! warnings about harness fixtures, shared scope files, unresolved verifies and
//! `verify_starts`.

mod checks;
mod named;
mod warnings;

use std::cmp::Ordering;
use std::fs;
use std::path::Path;

use osq_kernel_config::Config;
use osq_kernel_specs::VerifyStarts;
use osq_kernel_vcs::{GitVcs, Vcs};

use super::finding::Finding;
use super::verify::{self, Analysis, Project};

/// The folder of the project's living specs and changes.
const OPENSPEC: &str = "openspec";
/// The changes folder below the openspec folder.
const CHANGES: &str = "changes";
/// The task files folder below a change folder.
const TASKS: &str = "tasks";
/// The message for a change without a tasks folder.
const MISSING_TASKS: &str = "tasks directory not found in change folder";
/// The message for a tasks folder holding no Markdown file.
const NO_TASKS: &str = "No task files found under tasks/";
/// The manifests that mark a package at the project root.
const ROOT_MANIFESTS: [&str; 4] = ["package.json", "Cargo.toml", "pyproject.toml", "go.mod"];
/// The manifest naming the Rust language and a crate's test folders.
const CARGO_MANIFEST: &str = "Cargo.toml";
/// The test folders a crate's manifest adds to the frozen-test gate.
const CRATE_TEST_FOLDERS: [&str; 2] = ["tests", "benches"];

/// One task whose frontmatter parses, with the facts later rules reuse.
pub(super) struct TaskData {
    /// The task file's name, such as `1.md`.
    pub(super) name: String,
    /// The task's number, its name without `.md`.
    pub(super) number: String,
    /// The task file's path from the root.
    pub(super) path: String,
    /// The task's declared scope entries.
    pub(super) scope: Vec<String>,
    /// The task's verify command.
    pub(super) verify: String,
    /// The state the task's verify starts in.
    pub(super) verify_starts: VerifyStarts,
    /// The regular files the task's scope resolves to.
    pub(super) existing: Vec<String>,
    /// The task's verify command analysis.
    pub(super) analysis: Analysis,
}

/// The inputs every task rule reads once per change.
pub(super) struct Input<'a> {
    /// The project root.
    pub(super) root: &'a Path,
    /// The loaded project config.
    pub(super) config: &'a Config,
    /// The project facts the verify analysis reads.
    pub(super) project: &'a Project,
    /// The paths the frozen-test gate governs.
    pub(super) gated: &'a GatedPaths,
}

/// The paths the frozen-test gate governs: the root `tests` and every crate
/// test folder.
pub(super) struct GatedPaths {
    /// The folder and crate test folders, each relative to the root.
    folders: Vec<String>,
}

impl GatedPaths {
    /// Reads the root's project paths and the crate manifests among them.
    ///
    /// Implements: rust-lint/lint-task-rules
    pub(super) fn read(root: &Path) -> Self {
        let mut folders = vec!["tests".to_owned()];
        for path in project_paths(root) {
            if last_part(&path) != CARGO_MANIFEST {
                continue;
            }
            let folder = path.rsplit_once('/').map_or("", |(folder, _)| folder);
            for test in CRATE_TEST_FOLDERS {
                folders.push(join_folder(folder, test));
            }
        }
        folders.sort();
        folders.dedup();
        Self { folders }
    }

    /// True when the gate governs a path.
    ///
    /// Implements: rust-lint/lint-task-rules
    pub(super) fn covers(&self, path: &str) -> bool {
        self.folders
            .iter()
            .any(|folder| path == folder || path.starts_with(&format!("{folder}/")))
    }
}

/// The task rule findings for one change, in TypeScript's order.
///
/// Implements: rust-lint/lint-task-rules
pub(crate) fn findings(root: &Path, change: &Path, folder: &str, config: &Config) -> Vec<Finding> {
    let tasks_folder = change.join(TASKS);
    let names = task_names(&tasks_folder);
    let mut findings = folder_findings(folder, names.as_ref());
    let project = Project::read(root);
    let gated = GatedPaths::read(root);
    let input = Input {
        root,
        config,
        project: &project,
        gated: &gated,
    };
    let mut tasks = Vec::new();
    for name in names.unwrap_or_default() {
        let file = format!("{OPENSPEC}/{CHANGES}/{folder}/{TASKS}/{name}");
        let Some(content) = read_utf8(&tasks_folder.join(&name)) else {
            continue;
        };
        let outcome = checks::findings(&input, &name, &file, &content);
        findings.extend(outcome.findings);
        if let Some(task) = outcome.task {
            tasks.push(task);
        }
    }
    findings.extend(warnings::findings(
        root,
        &tasks,
        config.banned_words.is_empty(),
    ));
    findings
}

/// The task folder errors for a missing folder or no Markdown files.
fn folder_findings(folder: &str, names: Option<&Vec<String>>) -> Vec<Finding> {
    let file = format!("{OPENSPEC}/{CHANGES}/{folder}/{TASKS}");
    let mut findings = Vec::new();
    if names.is_none() {
        findings.push(Finding::new(
            super::finding::Severity::Error,
            file.clone(),
            None,
            MISSING_TASKS,
        ));
    }
    if names.is_none_or(Vec::is_empty) {
        findings.push(Finding::new(
            super::finding::Severity::Error,
            file,
            None,
            NO_TASKS,
        ));
    }
    findings
}

/// The task file names under `tasks`, in byte order, or none without a folder.
fn task_names(tasks: &Path) -> Option<Vec<String>> {
    let entries = fs::read_dir(tasks).ok()?;
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.as_bytes().ends_with(b".md"))
        .collect();
    names.sort();
    Some(names)
}

/// Reads a file as UTF-8 text, or none when it cannot be read or is not UTF-8.
fn read_utf8(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    String::from_utf8(bytes).ok()
}

/// Orders two task file names by their leading numbers, then by name.
pub(super) fn task_order(left: &str, right: &str) -> Ordering {
    match (leading_digits(left), leading_digits(right)) {
        (Some(left_number), Some(right_number)) => match numeric_order(left_number, right_number) {
            Ordering::Equal => left.cmp(right),
            other => other,
        },
        _ => left.cmp(right),
    }
}

/// The leading ASCII digits of a file name.
fn leading_digits(name: &str) -> Option<&str> {
    let end = name
        .find(|character: char| !character.is_ascii_digit())
        .unwrap_or(name.len());
    if end == 0 { None } else { Some(&name[..end]) }
}

/// Orders two digit strings by numeric value without parsing them.
fn numeric_order(left: &str, right: &str) -> Ordering {
    let left = left.trim_start_matches('0');
    let right = right.trim_start_matches('0');
    left.len().cmp(&right.len()).then_with(|| left.cmp(right))
}

/// The paths that give the project's languages, as the verify analysis reads them.
fn project_paths(root: &Path) -> Vec<String> {
    let mut paths = Vec::new();
    let vcs = GitVcs::new(root);
    if vcs
        .root()
        .ok()
        .flatten()
        .is_some_and(|found| same_root(root, &found))
    {
        if let Ok(endings) = vcs.line_endings() {
            paths.extend(endings.into_iter().map(|entry| entry.path));
        }
    }
    for manifest in ROOT_MANIFESTS {
        if root.join(manifest).is_file() {
            paths.push(manifest.to_owned());
        }
    }
    paths
}

/// True when two roots name the same folder once both resolve.
// The tracked paths cannot change the test folders a lint run sees, because the
// link gates refuse a root without `Cargo.toml`; both outcomes are equivalent.
// Only docs.rs sets `docsrs`, so the marker needs no crate in any build here.
#[cfg_attr(docsrs, mutants::skip)]
fn same_root(root: &Path, found: &Path) -> bool {
    match (fs::canonicalize(root), fs::canonicalize(found)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

/// The last slash-separated part of a path, or the path itself without one.
fn last_part(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// Joins a folder and a name with one slash, or the name alone for the root.
fn join_folder(folder: &str, name: &str) -> String {
    if folder.is_empty() {
        name.to_owned()
    } else {
        format!("{folder}/{name}")
    }
}

/// True when a project-relative path names an existing regular file.
pub(super) fn regular_file(root: &Path, path: &str) -> bool {
    root.join(path)
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_file())
}

/// The verify analysis of one task's command.
pub(super) fn analyze(root: &Path, verify: &str, project: &Project) -> Analysis {
    verify::analyze(root, verify, project)
}
