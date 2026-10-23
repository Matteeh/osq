//! TypeScript's entry rules: each task `entry` the change, its tasks, the tree
//! or another approved change cannot provide.

use std::fs;
use std::path::{Component, Path, PathBuf};

use osq_core::scope_covers_path;
use osq_kernel_config::Config;
use osq_kernel_loop::scope_files;
use osq_kernel_specs::{js_trim, parse_task_file};
use osq_kernel_storage::{ChangeEntry, list_changes};
use osq_kernel_vcs::{GitVcs, Vcs, stacked_root};

use super::finding::{Finding, Severity};
use super::tasks::{regular_file, task_order};

/// The folder of the project's living specs and changes.
const OPENSPEC: &str = "openspec";
/// The changes folder below the openspec folder.
const CHANGES: &str = "changes";
/// The tasks folder below a change folder.
const TASKS: &str = "tasks";
/// The archive folder below the changes folder.
const ARCHIVE: &str = "archive";
/// The approval marker a change folder holds once a human approved it.
const APPROVED: &str = ".run/approved";
/// The directory name the tree's default branch has when configuration is silent.
const FALLBACK_BRANCH: &str = "main";
/// The tree name used when git is off.
const PROJECT_TREE: &str = "the project";

/// One task whose frontmatter parses and whose entries the rule checks.
struct EntryTask {
    /// The task's number, its name without `.md`.
    number: String,
    /// The task file's path from the root.
    path: String,
    /// The task's declared scope entries.
    scope: Vec<String>,
    /// The task's declared entry paths.
    entry: Vec<String>,
}

/// The tree an entry may exist in: the default branch under git.
struct Tree {
    /// The git reader, or none when git is off.
    vcs: Option<GitVcs>,
    /// The default branch's name, or none when git is off.
    branch: Option<String>,
    /// The name the finding writes for this tree.
    name: String,
}

impl Tree {
    /// Reads whether git is on and names the tree an entry must be in.
    fn read(root: &Path, config: &Config) -> Self {
        let off = Self {
            vcs: None,
            branch: None,
            name: PROJECT_TREE.to_owned(),
        };
        if !config.vcs.enabled {
            return off;
        }
        let vcs = GitVcs::new(root);
        let Some(found) = vcs.root().ok().flatten() else {
            return off;
        };
        if !same_root(root, &found) {
            return off;
        }
        let fallback = config
            .vcs
            .default_branch
            .as_deref()
            .unwrap_or(FALLBACK_BRANCH);
        let Ok(branch) = vcs.default_branch(fallback) else {
            return off;
        };
        Self {
            vcs: Some(vcs),
            branch: Some(branch.clone()),
            name: branch,
        }
    }

    /// True when the tree holds `entry` as a pattern or a path.
    fn has(&self, root: &Path, entry: &str) -> bool {
        if is_pattern(entry) {
            return matcher(root, entry);
        }
        match (&self.vcs, &self.branch) {
            (Some(vcs), Some(branch)) => vcs.path_exists(branch, entry).unwrap_or(false),
            _ => entry_exists(root, entry),
        }
    }
}

/// The entry findings for one change, in task and entry order.
///
/// Implements: rust-lint/lint-entry-paths
pub(crate) fn findings(root: &Path, change: &Path, folder: &str, config: &Config) -> Vec<Finding> {
    let tree = Tree::read(root, config);
    let mut findings = Vec::new();
    let mut earlier: Vec<Vec<String>> = Vec::new();
    for task in read_tasks(change, folder) {
        for entry in &task.entry {
            let provided = provided_inside(root, change, folder, entry)
                || covers(&task.scope, &earlier, entry)
                || tree.has(root, entry)
                || provided_by_change(root, config, &tree, folder, entry);
            if !provided {
                findings.push(Finding::new(
                    Severity::Error,
                    task.path.clone(),
                    None,
                    format!(
                        "Task {} entry names {entry}, which is not in {} and no task up to this \
                         one creates",
                        task.number, tree.name
                    ),
                ));
            }
        }
        earlier.push(task.scope.clone());
    }
    findings
}

/// The tasks whose frontmatter parses, in the cross-task warnings' order.
fn read_tasks(change: &Path, folder: &str) -> Vec<EntryTask> {
    let tasks = change.join(TASKS);
    let Ok(entries) = fs::read_dir(&tasks) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.as_bytes().ends_with(b".md"))
        .collect();
    names.sort_by(|left, right| task_order(left, right));
    names
        .into_iter()
        .filter_map(|name| read_task(change, folder, &name))
        .collect()
}

/// One task file's entry inputs, or none when its frontmatter does not parse or
/// it already has a brace group finding.
fn read_task(change: &Path, folder: &str, name: &str) -> Option<EntryTask> {
    let path = change.join(TASKS).join(name);
    let content = fs::read_to_string(path).ok()?;
    let file = parse_task_file(&content).ok()?;
    if holds_brace(&file.scope) || holds_brace(&file.entry) {
        return None;
    }
    Some(EntryTask {
        number: name.strip_suffix(".md").unwrap_or(name).to_owned(),
        path: format!("{OPENSPEC}/{CHANGES}/{folder}/{TASKS}/{name}"),
        scope: file.scope,
        entry: file.entry,
    })
}

/// True when any of a task's `scope` or `entry` entries holds a brace group.
fn holds_brace(entries: &[String]) -> bool {
    entries
        .iter()
        .any(|entry| holds_brace_group(js_trim(entry)))
}

/// True when a text holds `{...}` with at least one comma and no other brace.
fn holds_brace_group(text: &str) -> bool {
    for (start, _) in text.match_indices('{') {
        let rest = &text[start + 1..];
        let Some(end) = rest.find(['{', '}']) else {
            continue;
        };
        if rest.as_bytes()[end] == b'}' && rest[..end].contains(',') {
            return true;
        }
    }
    false
}

/// True when the task's or an earlier task's scope covers the entry.
fn covers(scope: &[String], earlier: &[Vec<String>], entry: &str) -> bool {
    scope_covers_path(scope, entry)
        || earlier
            .iter()
            .any(|earlier_scope| scope_covers_path(earlier_scope, entry))
}

/// True when the entry names a path inside the change folder that exists there.
fn provided_inside(root: &Path, change: &Path, folder: &str, entry: &str) -> bool {
    let Some(rest) = inside_change(root, folder, entry) else {
        return false;
    };
    if is_pattern(&rest) {
        matcher(change, &rest)
    } else {
        entry_exists(change, &rest)
    }
}

/// The part of `entry` inside the change folder, or none when it names none.
fn inside_change(root: &Path, folder: &str, entry: &str) -> Option<String> {
    let prefix = format!("{OPENSPEC}/{CHANGES}/{folder}/");
    let normalized = js_trim(entry).replace('\\', "/");
    if let Some(rest) = normalized.strip_prefix(&prefix) {
        return Some(rest.to_owned());
    }
    let absolute = resolve(root, entry);
    let change = resolve(root, prefix.trim_end_matches('/'));
    relative_inside(&absolute, &change)
}

/// Resolves a path against the change folder and drops its `.` and `..` parts.
fn resolve(base: &Path, path: &str) -> PathBuf {
    let joined = base.join(path);
    let mut resolved = PathBuf::new();
    for component in joined.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                resolved.pop();
            }
            other => resolved.push(other.as_os_str()),
        }
    }
    resolved
}

/// The text of `path` relative to `folder`, or none when it leaves the folder.
fn relative_inside(path: &Path, folder: &Path) -> Option<String> {
    let rest = path.strip_prefix(folder).ok()?;
    Some(rest.to_string_lossy().replace('\\', "/"))
}

/// True when the entry is a glob or a trailing-directory form.
fn is_pattern(entry: &str) -> bool {
    let trimmed = js_trim(entry);
    trimmed.contains(['*', '?']) || trimmed.ends_with('/')
}

/// True when a scope pattern resolves to an existing file under `base`.
fn matcher(base: &Path, pattern: &str) -> bool {
    scope_files(base, &[pattern.to_owned()])
        .iter()
        .any(|path| regular_file(base, path))
}

/// True when a file or folder exists at a path under `root`.
fn entry_exists(root: &Path, entry: &str) -> bool {
    resolve(root, entry)
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_file() || metadata.file_type().is_dir())
}

/// True when another approved or archived change covers the entry with a scope.
fn provided_by_change(
    root: &Path,
    config: &Config,
    tree: &Tree,
    folder: &str,
    entry: &str,
) -> bool {
    for change in list_changes(root) {
        if change.folder == folder || !approved(root, config, tree, &change) {
            continue;
        }
        if change_tasks_cover(&change.path, entry) {
            return true;
        }
    }
    false
}

/// True when a change is approved or archived as `readDependencyState` reads it.
fn approved(root: &Path, config: &Config, tree: &Tree, change: &ChangeEntry) -> bool {
    match (&tree.vcs, &tree.branch) {
        (Some(vcs), Some(branch)) => branch_approved(root, config, vcs, branch, change),
        _ => checkout_approved(root, &change.folder),
    }
}

/// True when a change's `osq/` branch, or its stacked or checkout copy, is
/// approved, and false once the change has landed.
fn branch_approved(
    root: &Path,
    config: &Config,
    vcs: &GitVcs,
    default: &str,
    change: &ChangeEntry,
) -> bool {
    let changes = format!("{OPENSPEC}/{CHANGES}/{}", change.folder);
    let archive = format!("{OPENSPEC}/{CHANGES}/{ARCHIVE}/{}", change.folder);
    if vcs.path_exists(default, &archive).unwrap_or(false) {
        return false;
    }
    let branch = format!("osq/{}", change.folder);
    if branch_exists(vcs, &branch) {
        return vcs
            .path_exists(&branch, &format!("{archive}/{APPROVED}"))
            .unwrap_or(false)
            || vcs
                .path_exists(&branch, &format!("{changes}/{APPROVED}"))
                .unwrap_or(false);
    }
    if stacked_approved(root, config, &change.folder) {
        return true;
    }
    checkout_approved(root, &change.folder)
}

/// True when a change's branch exists by exact name.
fn branch_exists(vcs: &GitVcs, branch: &str) -> bool {
    vcs.list_branches(branch)
        .is_ok_and(|branches| branches.iter().any(|found| found == branch))
}

/// True when the stacked copy of a change holds its approval marker.
fn stacked_approved(root: &Path, config: &Config, folder: &str) -> bool {
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    stacked_root(&config.vcs, root, &home)
        .join(folder)
        .join(OPENSPEC)
        .join(CHANGES)
        .join(folder)
        .join(APPROVED)
        .exists()
}

/// True when a change's active or archived checkout folder is approved.
fn checkout_approved(root: &Path, folder: &str) -> bool {
    let changes = root.join(OPENSPEC).join(CHANGES);
    changes.join(folder).join(APPROVED).exists()
        || changes.join(ARCHIVE).join(folder).join(APPROVED).exists()
}

/// True when any task file of a change covers the entry with its scope.
fn change_tasks_cover(change: &Path, entry: &str) -> bool {
    let Ok(entries) = fs::read_dir(change.join(TASKS)) else {
        return false;
    };
    entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".md"))
        .any(|task| {
            let text = fs::read_to_string(task.path()).unwrap_or_default();
            let scope = parse_task_file(&text).map_or_else(|_| Vec::new(), |file| file.scope);
            scope_covers_path(&scope, entry)
        })
}

/// True when two roots name the same folder once both resolve.
fn same_root(root: &Path, found: &Path) -> bool {
    match (fs::canonicalize(root), fs::canonicalize(found)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}
