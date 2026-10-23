//! Proves the refusals and rejected branch claim of an approval with git on.

mod worktree_support;

use std::fs;

use worktree_support::{Repo, approve, branches, build_with, git, golden, render, worktrees};

/// The change folder every refusal row approves.
const FOLDER: &str = "001-alpha-twice";
/// The change's branch.
const BRANCH: &str = "osq/001-alpha-twice";

/// A golden row: its name, arguments, settings and setup.
struct Row {
    /// The golden's name without its extension.
    name: &'static str,
    /// The arguments after `approve`.
    args: &'static [&'static str],
    /// Extra `osq.toml` lines.
    extras: &'static [&'static str],
    /// The row's setup after the base commit.
    setup: fn(&Repo),
}

/// A refusal row: its name, settings, setup and message.
struct Refusal {
    /// A name for the assertion.
    name: &'static str,
    /// Extra `osq.toml` lines.
    extras: &'static [&'static str],
    /// The row's setup after the base commit.
    setup: fn(&Repo),
    /// The message after `approve failed: `.
    message: &'static str,
}

/// Does nothing for a row with no setup.
fn none(_: &Repo) {}

/// Puts HEAD on a new branch `feature` at `main`.
fn feature(repo: &Repo) {
    git(&repo.path, &["checkout", "-q", "-b", "feature"]);
}

/// Leaves a task-scoped edit uncommitted.
fn dirty(repo: &Repo) {
    fs::write(
        repo.path.join("src/alpha/index.js"),
        "module.exports = { runs: 3 };\n",
    )
    .expect("the dirty change is written");
}

/// Creates the change's branch at `main`, without a rejected record.
fn taken(repo: &Repo) {
    git(&repo.path, &["branch", BRANCH]);
}

/// Creates the change's branch with one commit that adds its rejected record.
fn rejected(repo: &Repo) {
    git(&repo.path, &["checkout", "-q", "-b", BRANCH]);
    let record = repo
        .path
        .join("openspec/changes/rejected/001-alpha-twice/.run");
    fs::create_dir_all(&record).expect("the rejected record folder is created");
    fs::write(record.join("rejected.md"), "rejected\n").expect("the rejected record is written");
    git(&repo.path, &["add", "openspec/changes/rejected"]);
    git(&repo.path, &["commit", "-q", "-m", "osq: 001 rejected"]);
    git(&repo.path, &["checkout", "-q", "main"]);
}

/// Detaches HEAD at `main`'s commit.
fn detached(repo: &Repo) {
    git(&repo.path, &["checkout", "-q", "--detach", "main"]);
}

/// Renames a task-scoped file with `git mv`.
fn renamed(repo: &Repo) {
    git(
        &repo.path,
        &["mv", "src/alpha/index.js", "src/alpha/moved.js"],
    );
}

/// Checks the rejected branch out in another worktree.
fn rejected_checked_out(repo: &Repo) {
    rejected(repo);
    let other = repo.root.join("other");
    let other = other.to_str().expect("the worktree path is UTF-8");
    git(&repo.path, &["worktree", "add", "-q", other, BRANCH]);
}

/// Proves every row of "Worktree refusals equal TypeScript's".
///
/// Covers: rust-approve/worktree-refusals-equal-typescript-s
#[test]
fn worktree_refusals_equal_typescript() {
    let rows = [
        Row {
            name: "off-default-001",
            args: &["1"],
            extras: &[],
            setup: feature,
        },
        Row {
            name: "base-ok-001",
            args: &["1", "--base-ok"],
            extras: &[],
            setup: feature,
        },
        Row {
            name: "dirty-keep-001",
            args: &["1"],
            extras: &[],
            setup: dirty,
        },
        Row {
            name: "dirty-block-001",
            args: &["1"],
            extras: &["manualEdits = \"block\""],
            setup: dirty,
        },
        Row {
            name: "ignore-dirty-001",
            args: &["1", "--ignore-dirty"],
            extras: &[],
            setup: dirty,
        },
        Row {
            name: "branch-exists-001",
            args: &["1"],
            extras: &[],
            setup: taken,
        },
        Row {
            name: "rejected-branch-001",
            args: &["1"],
            extras: &[],
            setup: rejected,
        },
    ];
    for row in rows {
        let repo = build_with(row.name, row.extras, row.setup);
        let result = approve(&repo.path, row.args);
        assert_eq!(
            format!("{}\n", render(&repo, FOLDER, &result)),
            golden(&format!("{}.txt", row.name)),
            "{}: golden text",
            row.name
        );
    }
}

/// Proves every row of "More refusals with git on" leaves git and the files.
///
/// Covers: rust-approve/more-refusals-with-git-on
#[test]
fn more_refusals_with_git_on() {
    let rows = [
        Refusal {
            name: "detached",
            extras: &[],
            setup: detached,
            message: "HEAD is on a detached HEAD, not the default branch main; pass --base-ok to approve from it",
        },
        Refusal {
            name: "other default",
            extras: &["defaultBranch = \"trunk\""],
            setup: none,
            message: "HEAD is on main, not the default branch trunk; pass --base-ok to approve from it",
        },
        Refusal {
            name: "renamed",
            extras: &[],
            setup: renamed,
            message: "uncommitted changes in task scope: src/alpha/index.js; keep them with osq manual \"<why>\", commit them, or pass --ignore-dirty",
        },
        Refusal {
            name: "checked out",
            extras: &[],
            setup: rejected_checked_out,
            message: "branch osq/001-alpha-twice already exists",
        },
    ];
    for row in rows {
        let repo = build_with(row.name, row.extras, row.setup);
        let before = state(&repo);
        let error = approve(&repo.path, &["1"]).expect_err("the row is refused");
        assert_eq!(
            error.to_string(),
            format!("approve failed: {}", row.message),
            "{}: message",
            row.name
        );
        assert_eq!(state(&repo), before, "{}: no write", row.name);
    }
}

/// Proves a rejected branch is renamed to the first free kept name.
///
/// Covers: rust-approve/kept-branch-name-skips-a-taken-one
#[test]
fn kept_branch_name_skips_a_taken_one() {
    let repo = build_with("kept-branch-skips", &[], rejected);
    git(
        &repo.path,
        &["branch", "osq/001-alpha-twice-rejected-1", "main"],
    );
    let result = approve(&repo.path, &["1"]).expect("the rejected branch is claimed");
    assert_eq!(
        result.text.lines().nth(2),
        Some("  Kept rejected branch: osq/001-alpha-twice-rejected-2"),
        "the third output line names the kept branch"
    );
    assert_eq!(
        branches(&repo.path),
        vec![
            "osq/001-alpha-twice",
            "osq/001-alpha-twice-rejected-1",
            "osq/001-alpha-twice-rejected-2",
        ],
        "the taken name is skipped"
    );
}

/// The branches, worktrees and checkout copy a refusal must leave alone.
fn state(repo: &Repo) -> (Vec<String>, Vec<String>, bool) {
    (
        branches(&repo.path),
        worktrees(&repo.path),
        repo.path.join("openspec/changes").join(FOLDER).exists(),
    )
}
