//! The patch and discard writes that save or drop an executor's work.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::VcsError;

use super::GitVcs;

/// The serial that keeps one process's temporary index folders distinct.
static NEXT_FOLDER: AtomicU64 = AtomicU64::new(0);

/// A new, empty folder for a copied index under the process's temporary folder.
fn temp_folder() -> PathBuf {
    let serial = NEXT_FOLDER.fetch_add(1, Ordering::Relaxed);
    let folder = std::env::temp_dir().join(format!("osq-patch-{}-{serial}", std::process::id()));
    let _ = fs::create_dir_all(&folder);
    folder
}

/// The path `output` names, resolved against the repository root.
fn resolved(vcs: &GitVcs, output: Option<&str>) -> PathBuf {
    vcs.root.join(output.unwrap_or_default().trim())
}

/// The refusal `discard` gives with `reason` as its output.
fn refusal(reason: &str) -> VcsError {
    VcsError::Failed {
        command: "git discard".to_owned(),
        output: reason.to_owned(),
    }
}

/// The trimmed lines of a line-oriented git output.
fn lines(output: &str) -> Vec<String> {
    output.lines().map(str::trim).map(str::to_owned).collect()
}

/// The arguments that list the files HEAD tracks under `paths`.
fn head_args<'a>(paths: &[&'a str]) -> Vec<&'a str> {
    let mut args = vec!["ls-tree", "-r", "--name-only", "HEAD", "--"];
    args.extend_from_slice(paths);
    args
}

/// The arguments that list the files the index tracks under `paths`.
fn index_args<'a>(paths: &[&'a str]) -> Vec<&'a str> {
    let mut args = vec!["ls-files", "--"];
    args.extend_from_slice(paths);
    args
}

/// The arguments that unstage `paths`.
fn rm_args<'a>(paths: &[&'a str]) -> Vec<&'a str> {
    let mut args = vec!["rm", "--cached", "-q", "--"];
    args.extend_from_slice(paths);
    args
}

/// The arguments that restore `paths` from HEAD in the index and the tree.
fn restore_args<'a>(paths: &[&'a str]) -> Vec<&'a str> {
    let mut args = vec!["restore", "--source=HEAD", "--staged", "--worktree", "--"];
    args.extend_from_slice(paths);
    args
}

/// The arguments that remove untracked files under `paths`.
fn clean_args<'a>(paths: &[&'a str]) -> Vec<&'a str> {
    let mut args = vec!["clean", "-fd", "--"];
    args.extend_from_slice(paths);
    args
}

/// The files HEAD tracks under `paths`.
fn head_paths(vcs: &GitVcs, paths: &[&str]) -> Result<Vec<String>, VcsError> {
    let output = vcs.read(&head_args(paths))?;
    Ok(lines(output.as_deref().unwrap_or_default()))
}

/// The files the index tracks under `paths`.
fn index_paths(vcs: &GitVcs, paths: &[&str]) -> Result<Vec<String>, VcsError> {
    let output = vcs.read(&index_args(paths))?;
    Ok(lines(output.as_deref().unwrap_or_default()))
}

/// Refuses a repository that is not a linked worktree.
fn assert_linked_worktree(vcs: &GitVcs) -> Result<(), VcsError> {
    let git_dir = resolved(vcs, vcs.read(&["rev-parse", "--git-dir"])?.as_deref());
    let common_dir = resolved(
        vcs,
        vcs.read(&["rev-parse", "--git-common-dir"])?.as_deref(),
    );
    if git_dir == common_dir {
        return Err(refusal("discard requires a linked worktree"));
    }
    Ok(())
}

/// Refuses a tree whose HEAD is on no branch starting with `osq/`.
fn assert_osq_branch(vcs: &GitVcs) -> Result<(), VcsError> {
    let branch = vcs.read(&["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let branch = branch.as_deref().unwrap_or_default().trim();
    if branch.starts_with("osq/") {
        Ok(())
    } else {
        Err(refusal(
            "discard requires HEAD on a branch starting \"osq/\"",
        ))
    }
}

/// Refuses a `discard` outside an osq worktree.
fn assert_discardable(vcs: &GitVcs) -> Result<(), VcsError> {
    assert_linked_worktree(vcs)?;
    assert_osq_branch(vcs)
}

/// Builds the patch through a copy of the index in `folder`.
fn patch_through(vcs: &GitVcs, base: Option<&str>, folder: &Path) -> Result<String, VcsError> {
    let index_output = vcs.read(&["rev-parse", "--git-path", "index"])?;
    let real_index = vcs
        .root
        .join(index_output.as_deref().unwrap_or_default().trim());
    let index = folder.join("index");
    let _ = fs::copy(&real_index, &index);
    let index_text = index.to_string_lossy();
    let env = [("GIT_INDEX_FILE", index_text.as_ref())];
    vcs.write(&["add", "-A"], &env, None)?;
    let args = ["diff", "--cached", "--binary", base.unwrap_or("HEAD")];
    let output = vcs.write(&args, &env, None)?;
    Ok(output.stdout)
}

/// The binary diff of the working tree, untracked files included.
pub(super) fn patch(vcs: &GitVcs, base: Option<&str>) -> Result<String, VcsError> {
    let folder = temp_folder();
    let result = patch_through(vcs, base, &folder);
    let _ = fs::remove_dir_all(&folder);
    result
}

/// Returns `paths` to HEAD's state in an osq worktree.
pub(super) fn discard(vcs: &GitVcs, paths: &[&str]) -> Result<(), VcsError> {
    if paths.is_empty() {
        return Ok(());
    }
    assert_discardable(vcs)?;
    let head = head_paths(vcs, paths)?;
    let index = index_paths(vcs, paths)?;
    let absent: Vec<&str> = index
        .iter()
        .filter(|path| !head.contains(*path))
        .map(String::as_str)
        .collect();
    if !absent.is_empty() {
        vcs.write(&rm_args(&absent), &[], None)?;
    }
    if !head.is_empty() {
        let present: Vec<&str> = head.iter().map(String::as_str).collect();
        vcs.write(&restore_args(&present), &[], None)?;
    }
    vcs.write(&clean_args(paths), &[], None).map(|_| ())
}
