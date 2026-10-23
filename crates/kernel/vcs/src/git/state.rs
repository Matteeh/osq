//! Each repository state read's git arguments and its pure parser.

use std::path::{Path, PathBuf};

use crate::VcsError;
use crate::port::{Head, StatusEntry, Worktree};
use crate::record::TREE_RECORD_FILE;

use super::GitVcs;

/// The trimmed, non-empty form of `text`, or none.
fn non_empty(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_owned())
    }
}

/// The trimmed lines of a line-oriented git output, empty ones left out.
fn lines(output: &str) -> Vec<String> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

/// The repository's top level as canonical, or as reported when that fails.
fn parse_root(output: &str) -> Option<PathBuf> {
    let trimmed = output.trim();
    if trimmed.is_empty() {
        return None;
    }
    let path = PathBuf::from(trimmed);
    Some(std::fs::canonicalize(&path).unwrap_or(path))
}

/// HEAD's commit and branch from their two outputs.
fn parse_head(sha: Option<&str>, branch: Option<&str>) -> Head {
    Head {
        sha: sha.and_then(non_empty),
        branch: branch.and_then(non_empty),
    }
}

/// Parses `status --porcelain=v1 -z` output into its entries.
fn parse_status(output: &str) -> Vec<StatusEntry> {
    let mut fields = output.split('\0');
    let mut entries = Vec::new();
    while let Some(field) = fields.next() {
        if field.chars().count() < 4 {
            continue;
        }
        let code: String = field.chars().take(2).collect();
        let path: String = field.chars().skip(3).collect();
        let from = if code.contains('R') || code.contains('C') {
            fields
                .next()
                .filter(|old| !old.is_empty())
                .map(str::to_owned)
        } else {
            None
        };
        entries.push(StatusEntry { code, path, from });
    }
    entries
}

/// Parses `worktree list --porcelain` output into its worktrees.
fn parse_worktrees(output: &str) -> Vec<Worktree> {
    let mut trees = Vec::new();
    let mut current: Option<Worktree> = None;
    for raw in output.lines() {
        let line = raw.trim();
        if line.is_empty() {
            if let Some(tree) = current.take() {
                trees.push(tree);
            }
        } else if let Some(path) = line.strip_prefix("worktree ") {
            if let Some(tree) = current.take() {
                trees.push(tree);
            }
            current = Some(Worktree {
                path: path.to_owned(),
                branch: None,
                head: None,
            });
        } else if let Some(tree) = current.as_mut() {
            if let Some(head) = line.strip_prefix("HEAD ") {
                tree.head = Some(head.to_owned());
            } else if let Some(branch) = line.strip_prefix("branch ") {
                let short = branch.strip_prefix("refs/heads/").unwrap_or(branch);
                tree.branch = Some(short.to_owned());
            }
        }
    }
    if let Some(tree) = current {
        trees.push(tree);
    }
    trees
}

/// Reads the repository's top level.
pub(super) fn root(vcs: &GitVcs) -> Result<Option<PathBuf>, VcsError> {
    let output = vcs.read(&["rev-parse", "--show-toplevel"])?;
    Ok(output.as_deref().and_then(parse_root))
}

/// Reads HEAD's commit first, then the branch it points to.
pub(super) fn head(vcs: &GitVcs) -> Result<Head, VcsError> {
    let sha = vcs.read(&["rev-parse", "--verify", "--quiet", "HEAD"])?;
    let branch = vcs.read(&["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    Ok(parse_head(sha.as_deref(), branch.as_deref()))
}

/// Reads the working tree's porcelain entries.
pub(super) fn status(vcs: &GitVcs) -> Result<Vec<StatusEntry>, VcsError> {
    let output = vcs.read(&["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
    Ok(output.as_deref().map(parse_status).unwrap_or_default())
}

/// Reads one git config value.
pub(super) fn config_value(vcs: &GitVcs, key: &str) -> Result<Option<String>, VcsError> {
    let output = vcs.read(&["config", "--get", key])?;
    Ok(output.as_deref().and_then(non_empty))
}

/// Reads the default branch from the local remote ref, else `fallback`.
pub(super) fn default_branch(vcs: &GitVcs, fallback: &str) -> Result<String, VcsError> {
    let output = vcs.read(&[
        "symbolic-ref",
        "--quiet",
        "--short",
        "refs/remotes/origin/HEAD",
    ])?;
    let branch = output
        .as_deref()
        .map(str::trim)
        .and_then(|value| value.strip_prefix("origin/"))
        .filter(|value| !value.is_empty());
    Ok(branch.map_or_else(|| fallback.to_owned(), str::to_owned))
}

/// Reads one file's contents at a rev.
pub(super) fn show(vcs: &GitVcs, rev: &str, path: &str) -> Result<Option<String>, VcsError> {
    let spec = format!("{rev}:{path}");
    vcs.read(&["show", &spec])
}

/// Reads whether a path exists at a rev.
pub(super) fn path_exists(vcs: &GitVcs, rev: &str, path: &str) -> Result<bool, VcsError> {
    let spec = format!("{rev}:{path}");
    Ok(vcs.read(&["cat-file", "-e", &spec])?.is_some())
}

/// Reads every branch with the prefix.
pub(super) fn list_branches(vcs: &GitVcs, prefix: &str) -> Result<Vec<String>, VcsError> {
    let pattern = format!("{prefix}*");
    let output = vcs.read(&["branch", "--list", "--format=%(refname:short)", &pattern])?;
    Ok(output.as_deref().map(lines).unwrap_or_default())
}

/// Reads every worktree.
pub(super) fn worktree_list(vcs: &GitVcs) -> Result<Vec<Worktree>, VcsError> {
    let output = vcs.read(&["worktree", "list", "--porcelain"])?;
    Ok(output.as_deref().map(parse_worktrees).unwrap_or_default())
}

/// Reads the tree record's path from the repository's common git directory.
pub(super) fn tree_record_path(vcs: &GitVcs) -> Result<Option<PathBuf>, VcsError> {
    let output = vcs.read(&["rev-parse", "--git-common-dir"])?;
    Ok(output
        .as_deref()
        .and_then(|text| parse_tree_record_path(&vcs.root, text)))
}

/// The record file under `root` for the common directory git prints, or none
/// when it prints nothing.
fn parse_tree_record_path(root: &Path, output: &str) -> Option<PathBuf> {
    let common = output.trim();
    if common.is_empty() {
        return None;
    }
    Some(root.join(common).join(TREE_RECORD_FILE))
}
