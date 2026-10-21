//! The pure audit of a task's changed paths against its scope and frozen tests,
//! as TypeScript's git guard and undeclared-test gate decide (ADR 017).

use crate::scope::glob::scope_covers_path;

/// The root folder whose added files are let through without scope.
const ROOT_TESTS: &str = "tests";

/// The task facts [`audit_scope`] checks one set of changed paths against.
///
/// Implements: rust-core/scope-audit
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScopeAudit {
    /// The task's declared scope entries.
    pub scope: Vec<String>,
    /// Whether the task may change frozen tests.
    pub tests_modify: bool,
    /// The change folder every changed path may live under.
    pub change_folder: String,
    /// The language test folders whose files are frozen.
    pub test_folders: Vec<String>,
    /// The rules that let a lock file follow a changed manifest.
    pub lock_rules: Vec<LockRule>,
    /// The paths that changed since the task started.
    pub changes: Vec<ChangedPath>,
}

/// One path that changed since the task started and how it changed.
///
/// Implements: rust-core/scope-audit
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChangedPath {
    /// The project-relative POSIX path.
    pub path: String,
    /// How the path changed.
    pub change: PathChange,
}

/// How one changed path changed.
///
/// Implements: rust-core/scope-audit-rules
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PathChange {
    /// The path is new since the task started.
    Added,
    /// The path existed and its content changed.
    Modified,
    /// The path no longer exists.
    Deleted,
}

/// The base names of one language's manifests and the lock files that follow them.
///
/// Implements: rust-core/scope-audit-rules
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LockRule {
    /// The manifest base names, such as `Cargo.toml`.
    pub manifests: Vec<String>,
    /// The lock-file base names, such as `Cargo.lock`.
    pub lock_files: Vec<String>,
}

/// One changed path the task may not have changed, and the reason why.
///
/// Implements: rust-core/scope-audit
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Disallowed {
    /// The project-relative POSIX path.
    pub path: String,
    /// Why the path is disallowed.
    pub reason: DisallowReason,
}

/// Why [`audit_scope`] disallows one changed path.
///
/// Implements: rust-core/scope-audit
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum DisallowReason {
    /// The scope, change folder and lock rules do not allow the path.
    OutsideScope,
    /// A frozen test existed and was modified without authorization.
    FrozenTestModified,
    /// A frozen test existed and was deleted without authorization.
    FrozenTestDeleted,
}

/// Gives every changed path the task may not have changed, with its reason.
///
/// A path is allowed when it is added under the root `tests` folder, the scope
/// covers it, it is in the change folder, or it is a lock file following a
/// covered changed manifest. A modified or deleted path at or under `tests` or
/// a test folder is frozen unless `tests_modify` is set and the scope covers it.
/// The result is sorted by path, with `OutsideScope` first for one path.
///
/// Implements: rust-core/scope-audit
#[must_use]
pub fn audit_scope(audit: &ScopeAudit) -> Vec<Disallowed> {
    let mut disallowed = Vec::new();
    for changed in &audit.changes {
        if !is_allowed(audit, changed) {
            disallowed.push(Disallowed {
                path: changed.path.clone(),
                reason: DisallowReason::OutsideScope,
            });
        }
        if let Some(reason) = frozen_reason(audit, changed) {
            disallowed.push(Disallowed {
                path: changed.path.clone(),
                reason,
            });
        }
    }
    disallowed.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.reason.cmp(&right.reason))
    });
    disallowed
}

/// True when the scope, change folder or a lock rule allows `changed`.
fn is_allowed(audit: &ScopeAudit, changed: &ChangedPath) -> bool {
    (changed.change == PathChange::Added && is_at_or_under(&changed.path, ROOT_TESTS))
        || scope_covers_path(&audit.scope, &changed.path)
        || is_at_or_under(&changed.path, &audit.change_folder)
        || lock_file_follows(audit, &changed.path)
}

/// The frozen-test reason for `changed`, or `None` when it is not frozen.
fn frozen_reason(audit: &ScopeAudit, changed: &ChangedPath) -> Option<DisallowReason> {
    if changed.change == PathChange::Added || !is_test_path(&changed.path, &audit.test_folders) {
        return None;
    }
    if audit.tests_modify && scope_covers_path(&audit.scope, &changed.path) {
        return None;
    }
    match changed.change {
        PathChange::Modified => Some(DisallowReason::FrozenTestModified),
        PathChange::Deleted => Some(DisallowReason::FrozenTestDeleted),
        PathChange::Added => None,
    }
}

/// True when `path` is a lock file following a covered changed manifest.
fn lock_file_follows(audit: &ScopeAudit, path: &str) -> bool {
    let lock_base = base_name_of(path);
    let lock_folder = folder_of(path);
    audit.lock_rules.iter().any(|rule| {
        rule.lock_files
            .iter()
            .any(|name| name.as_str() == lock_base)
            && audit.changes.iter().any(|manifest| {
                scope_covers_path(&audit.scope, &manifest.path)
                    && rule
                        .manifests
                        .iter()
                        .any(|name| name.as_str() == base_name_of(&manifest.path))
                    && is_at_or_below(folder_of(&manifest.path), lock_folder)
            })
    })
}

/// True when `path` is the root `tests` folder or one of the test folders.
fn is_test_path(path: &str, test_folders: &[String]) -> bool {
    is_at_or_under(path, ROOT_TESTS)
        || test_folders
            .iter()
            .any(|folder| is_at_or_under(path, folder))
}

/// The folder part of a POSIX path, `""` for a root file.
fn folder_of(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(folder, _)| folder)
}

/// The file part of a POSIX path.
fn base_name_of(path: &str) -> &str {
    path.rsplit_once('/').map_or(path, |(_, name)| name)
}

/// True when `path` is `folder` itself or a path below it.
fn is_at_or_under(path: &str, folder: &str) -> bool {
    path == folder
        || path
            .strip_prefix(folder)
            .is_some_and(|rest| rest.starts_with('/'))
}

/// True when `folder` is `parent` or a folder below it.
fn is_at_or_below(folder: &str, parent: &str) -> bool {
    parent.is_empty()
        || folder
            .strip_prefix(parent)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
}
