//! Each branch, worktree, index and commit write's git arguments.

use crate::VcsError;

use super::GitVcs;

/// Splits `Name <email>` into its name and email, keeping the whole string as
/// the name when it does not end in `<...>`.
fn parse_author(author: &str) -> (&str, &str) {
    if let Some(rest) = author.strip_suffix('>') {
        if let Some((name, email)) = rest.split_once('<') {
            return (name.trim_end(), email);
        }
    }
    (author, "")
}

/// Whether git is set to sign commits, though `commit-tree` ignores that.
fn sign_commits(vcs: &GitVcs) -> Result<bool, VcsError> {
    let value = vcs.read(&["config", "--type=bool", "--get", "commit.gpgSign"])?;
    Ok(value.is_some_and(|output| output.trim() == "true"))
}

/// Creates `name` at `base`.
pub(super) fn create_branch(vcs: &GitVcs, name: &str, base: &str) -> Result<(), VcsError> {
    vcs.write(&["branch", name, base], &[], None).map(|_| ())
}

/// Renames `from` to `to`.
pub(super) fn rename_branch(vcs: &GitVcs, from: &str, to: &str) -> Result<(), VcsError> {
    vcs.write(&["branch", "-m", from, to], &[], None)
        .map(|_| ())
}

/// Deletes `name`, never forcing a branch HEAD does not hold.
pub(super) fn delete_branch(vcs: &GitVcs, name: &str) -> Result<(), VcsError> {
    vcs.write(&["branch", "-d", name], &[], None).map(|_| ())
}

/// Adds a worktree at `path` for `branch`.
pub(super) fn worktree_add(vcs: &GitVcs, path: &str, branch: &str) -> Result<(), VcsError> {
    vcs.write(&["worktree", "add", path, branch], &[], None)
        .map(|_| ())
}

/// Removes the worktree at `path`.
pub(super) fn worktree_remove(vcs: &GitVcs, path: &str) -> Result<(), VcsError> {
    vcs.write(&["worktree", "remove", path], &[], None)
        .map(|_| ())
}

/// Drops git's records of worktrees whose folder no longer exists.
pub(super) fn worktree_prune(vcs: &GitVcs) -> Result<(), VcsError> {
    vcs.write(&["worktree", "prune"], &[], None).map(|_| ())
}

/// Stages exactly `paths`, deletions included.
pub(super) fn stage(vcs: &GitVcs, paths: &[&str]) -> Result<(), VcsError> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["add", "-A", "--"];
    args.extend_from_slice(paths);
    vcs.write(&args, &[], None).map(|_| ())
}

/// The arguments that stage `paths` before a commit of only those paths.
fn add_args<'a>(paths: &[&'a str]) -> Vec<&'a str> {
    let mut args = vec!["add", "--"];
    args.extend_from_slice(paths);
    args
}

/// The arguments that commit `paths` only, or the index when there are none.
fn commit_args<'a>(author: &'a str, paths: &[&'a str]) -> Vec<&'a str> {
    let mut args = vec!["commit", author, "-F", "-"];
    if !paths.is_empty() {
        args.push("--only");
        args.push("--");
        args.extend_from_slice(paths);
    }
    args
}

/// Stages and commits only `paths`, and gives the new commit.
pub(super) fn commit(
    vcs: &GitVcs,
    paths: &[&str],
    message: &str,
    author: &str,
) -> Result<String, VcsError> {
    if !paths.is_empty() {
        vcs.write(&add_args(paths), &[], None)?;
    }
    let author_arg = format!("--author={author}");
    let args = commit_args(&author_arg, paths);
    vcs.write(&args, &[], Some(message))?;
    let head = vcs.write(&["rev-parse", "--verify", "HEAD"], &[], None)?;
    Ok(head.stdout.trim().to_owned())
}

/// The arguments that commit `tree` with its parents, `-S` when signing.
fn tree_args<'a>(
    tree: &'a str,
    parent: &'a str,
    extra_parents: &[&'a str],
    sign: bool,
) -> Vec<&'a str> {
    let mut args = vec!["commit-tree", tree, "-p", parent];
    for extra in extra_parents {
        args.push("-p");
        args.push(extra);
    }
    args.push("-F");
    args.push("-");
    if sign {
        args.push("-S");
    }
    args
}

/// Commits `source`'s tree with its parents, and gives the new commit.
pub(super) fn commit_tree(
    vcs: &GitVcs,
    source: &str,
    parent: &str,
    message: &str,
    author: &str,
    extra_parents: &[&str],
) -> Result<String, VcsError> {
    let sign = sign_commits(vcs)?;
    let tree = format!("{source}^{{tree}}");
    let args = tree_args(&tree, parent, extra_parents, sign);
    let (name, email) = parse_author(author);
    let env = [("GIT_AUTHOR_NAME", name), ("GIT_AUTHOR_EMAIL", email)];
    let output = vcs.write(&args, &env, Some(message))?;
    Ok(output.stdout.trim().to_owned())
}
