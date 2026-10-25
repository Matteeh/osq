//! Proves what a stacked approval waits for, every row of its scenario.

mod worktree_support;

use std::fs;
use std::path::{Path, PathBuf};

use worktree_support::{Repo, SEAL, approve, branches, build_with, git};

/// The change every row queries by `1`.
const ALPHA: &str = "001-alpha-twice";
/// The change every row queries by `2`.
const GAMMA: &str = "002-gamma";
/// The copy of the alpha change some rows add.
const THRICE: &str = "003-alpha-thrice";

/// One row of "What a stacked approval waits for".
struct Row {
    /// A name for the scratch repository.
    name: &'static str,
    /// The row's setup after the base commit.
    setup: fn(&Repo),
    /// The query after `approve`.
    query: &'static str,
    /// The folder the query names.
    folder: &'static str,
    /// The `.run/stacked-on` text, or none when the row does not stack.
    expected: Option<String>,
}

/// Proves every row of "What a stacked approval waits for".
///
/// Covers: rust-approve/what-a-stacked-approval-waits-for
#[test]
fn what_a_stacked_approval_waits_for() {
    let rows = [
        Row {
            name: "declared-approved",
            setup: alpha_then_depends,
            query: "2",
            folder: GAMMA,
            expected: Some(format!("001-alpha-twice {SEAL}")),
        },
        Row {
            name: "declared-unapproved",
            setup: depends_on_alpha,
            query: "2",
            folder: GAMMA,
            expected: None,
        },
        Row {
            name: "overlap-approved",
            setup: thrice_then_approved,
            query: "1",
            folder: ALPHA,
            expected: Some(format!("003-alpha-thrice {SEAL} overlap alpha")),
        },
        Row {
            name: "no-shared-capability",
            setup: approve_gamma,
            query: "1",
            folder: ALPHA,
            expected: None,
        },
        Row {
            name: "overlap-stacked",
            setup: stacked_thrice,
            query: "1",
            folder: ALPHA,
            expected: Some("003-alpha-thrice sealed overlap alpha".to_owned()),
        },
        Row {
            name: "declared-archived-branch",
            setup: archived_branch,
            query: "2",
            folder: GAMMA,
            expected: Some("001-alpha-twice sealed".to_owned()),
        },
        Row {
            name: "declared-overlap",
            setup: approved_thrice_depends,
            query: "1",
            folder: ALPHA,
            expected: Some(format!("003-alpha-thrice {SEAL}")),
        },
        Row {
            name: "declared-landed",
            setup: landed_alpha,
            query: "2",
            folder: GAMMA,
            expected: None,
        },
        Row {
            name: "stacked-on-lines",
            setup: written_stacked_on,
            query: "1",
            folder: ALPHA,
            expected: Some("002-gamma sha256:old overlap gamma,beta".to_owned()),
        },
        Row {
            name: "unawaited-stacked-on",
            setup: unawaited_stacked_on,
            query: "1",
            folder: ALPHA,
            expected: None,
        },
    ];
    for row in rows {
        let name = format!("what_a_stacked_approval_waits_for_{}", row.name);
        let repo = build_with(&name, &[], row.setup);
        let result = approve(&repo.path, &[row.query]);
        result.unwrap_or_else(|error| panic!("{}: {error}", row.name));
        check(&repo, &row);
    }
}

/// Proves a checkout approval marker counts as an awaited dependency.
///
/// Covers: rust-approve/what-a-stacked-approval-waits-for
#[test]
fn checkout_marker_awaits() {
    let repo = build_with(
        "what_a_stacked_approval_waits_for_checkout_marker",
        &[],
        checkout_marker,
    );
    approve(&repo.path, &["2"]).expect("the dependency awaits");
    let path = repo
        .root
        .join("worktrees/repo/.stacked")
        .join(GAMMA)
        .join("openspec/changes")
        .join(GAMMA)
        .join(".run/stacked-on");
    assert_eq!(
        fs::read_to_string(path).expect("the stacked-on file reads"),
        "001-alpha-twice sealed",
        "the checkout marker makes alpha an awaited dependency"
    );
}

/// Makes gamma depend on alpha, and writes alpha's checkout approval marker.
fn checkout_marker(repo: &Repo) {
    depends_on(repo, GAMMA, "\"001\"");
    approved_marker(&change(repo, ALPHA), "sealed\n");
}

/// Checks one row's stacked-on text, or that the row did not stack.
fn check(repo: &Repo, row: &Row) {
    let stacked = repo.root.join("worktrees/repo/.stacked").join(row.folder);
    if let Some(expected) = &row.expected {
        let path = stacked
            .join("openspec/changes")
            .join(row.folder)
            .join(".run/stacked-on");
        assert_eq!(
            fs::read_to_string(&path).expect("the stacked-on file reads"),
            *expected,
            "{}: stacked-on",
            row.name
        );
    } else {
        let branch = format!("osq/{}", row.folder);
        assert!(
            branches(&repo.path).contains(&branch),
            "{}: the branch {branch} is created",
            row.name
        );
        assert!(!stacked.exists(), "{}: no stacked folder", row.name);
    }
}

/// Approves the alpha change, then makes the gamma change depend on it.
fn alpha_then_depends(repo: &Repo) {
    approve_ok(repo, "1");
    depends_on(repo, GAMMA, "\"001\"");
}

/// Makes the gamma change's proposal depend on `001`.
fn depends_on_alpha(repo: &Repo) {
    depends_on(repo, GAMMA, "\"001\"");
}

/// Adds a copy of the alpha change as `003-alpha-thrice` and approves it.
fn thrice_then_approved(repo: &Repo) {
    add_thrice(repo);
    approve_ok(repo, "3");
}

/// Approves the gamma change.
fn approve_gamma(repo: &Repo) {
    approve_ok(repo, "2");
}

/// Leaves an approved copy of the alpha change under the stacked root.
fn stacked_thrice(repo: &Repo) {
    let target = stacked_folder(repo, THRICE);
    copy_tree(&change(repo, ALPHA), &target);
    approved_marker(&target, "sealed\n");
}

/// Makes gamma depend on alpha, and archives alpha on its branch.
fn archived_branch(repo: &Repo) {
    depends_on(repo, GAMMA, "\"001\"");
    git(&repo.path, &["checkout", "-q", "-b", "osq/001-alpha-twice"]);
    let target = repo.path.join("openspec/changes/archive").join(ALPHA);
    approved_marker(&target, "sealed\n");
    git(
        &repo.path,
        &["add", "openspec/changes/archive/001-alpha-twice"],
    );
    git(&repo.path, &["commit", "-q", "-m", "archive alpha"]);
    git(&repo.path, &["checkout", "-q", "main"]);
}

/// Approves `003-alpha-thrice`, then makes alpha depend on it.
fn approved_thrice_depends(repo: &Repo) {
    thrice_then_approved(repo);
    depends_on(repo, ALPHA, "\"003\"");
}

/// Makes gamma depend on alpha, and lands alpha on the default branch.
fn landed_alpha(repo: &Repo) {
    depends_on(repo, GAMMA, "\"001\"");
    let target = repo.path.join("openspec/changes/archive").join(ALPHA);
    copy_tree(&change(repo, ALPHA), &target);
    approved_marker(&target, "sealed\n");
    git(
        &repo.path,
        &["add", "openspec/changes/archive/001-alpha-twice"],
    );
    git(&repo.path, &["commit", "-q", "-m", "archive alpha"]);
}

/// Approves gamma, then writes the alpha change's own valid and junk lines.
fn written_stacked_on(repo: &Repo) {
    approve_ok(repo, "2");
    write(
        &change(repo, ALPHA).join(".run/stacked-on"),
        "002-gamma sha256:old overlap gamma,,beta\njunk\n001-alpha-twice x\n",
    );
}

/// Approves gamma, then names an unapproved folder in alpha's overlap line.
fn unawaited_stacked_on(repo: &Repo) {
    approve_ok(repo, "2");
    write(
        &change(repo, ALPHA).join(".run/stacked-on"),
        "003-alpha-thrice sha256:old overlap alpha",
    );
}

/// Approves a query, requiring an Output.
fn approve_ok(repo: &Repo, query: &str) {
    approve(&repo.path, &[query]).unwrap_or_else(|error| panic!("approve {query}: {error}"));
}

/// The path of `name` under the stacked root.
fn stacked_folder(repo: &Repo, name: &str) -> PathBuf {
    repo.root
        .join("worktrees/repo/.stacked")
        .join(name)
        .join("openspec/changes")
        .join(name)
}

/// Adds an uncommitted `003-alpha-thrice` copy of the alpha change.
fn add_thrice(repo: &Repo) {
    copy_tree(&change(repo, ALPHA), &change(repo, THRICE));
}

/// Rewrites one change's `depends_on` line to the given YAML list body.
fn depends_on(repo: &Repo, folder: &str, ids: &str) {
    let path = change(repo, folder).join("proposal.md");
    let text = fs::read_to_string(&path).expect("the proposal reads");
    let text = text.replace("depends_on: []", &format!("depends_on: [{ids}]"));
    fs::write(path, text).expect("the proposal is written");
}

/// The path of one active change folder in the checkout.
fn change(repo: &Repo, folder: &str) -> PathBuf {
    repo.path.join("openspec/changes").join(folder)
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the parent folder is created");
    }
    fs::write(path, text).expect("the file is written");
}

/// Writes an approval marker with exactly `text`, creating its `.run` folder.
fn approved_marker(folder: &Path, text: &str) {
    write(&folder.join(".run/approved"), text);
}

/// Copies a folder tree, dot folders and files included.
fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the target folder is created");
    for entry in fs::read_dir(from).expect("the source folder is read") {
        let entry = entry.expect("the folder entry is read");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type is read").is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}
