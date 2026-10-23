//! Proves a change TypeScript would stack is refused before any write.

mod worktree_support;

use std::fs;
use std::path::Path;

use worktree_support::{Repo, approve, branches, build_with, git, worktrees};

/// The change every row queries by `1`.
const ALPHA: &str = "001-alpha-twice";
/// The change every row queries by `2`.
const GAMMA: &str = "002-gamma";
/// The copy of the alpha change some rows add.
const THRICE: &str = "003-alpha-thrice";

/// One row of "Stacking refusals": its setup, query and expected outcome.
struct Row {
    /// A name for the scratch repository.
    name: &'static str,
    /// The row's setup after the base commit.
    setup: fn(&Repo),
    /// The query after `approve`.
    query: &'static str,
    /// The folder the query names.
    folder: &'static str,
    /// The refusal after `approve failed: `, or none when the row approves.
    refusal: Option<&'static str>,
}

/// Proves every row of "Stacking refusals".
///
/// Covers: rust-approve/stacking-refusals
#[test]
fn stacking_refusals() {
    let rows = [
        Row {
            name: "declared-approved",
            setup: alpha_then_depends,
            query: "2",
            folder: GAMMA,
            refusal: Some(
                "Change 002-gamma would stack on 001-alpha-twice. Rust approve does not stack approvals yet.",
            ),
        },
        Row {
            name: "declared-unapproved",
            setup: depends_on_alpha,
            query: "2",
            folder: GAMMA,
            refusal: None,
        },
        Row {
            name: "overlap-approved",
            setup: thrice_then_approved,
            query: "1",
            folder: ALPHA,
            refusal: Some(
                "Change 001-alpha-twice would stack on 003-alpha-thrice. Rust approve does not stack approvals yet.",
            ),
        },
        Row {
            name: "no-shared-capability",
            setup: approve_gamma,
            query: "1",
            folder: ALPHA,
            refusal: None,
        },
        Row {
            name: "overlap-stacked",
            setup: stacked_thrice,
            query: "1",
            folder: ALPHA,
            refusal: Some(
                "Change 001-alpha-twice would stack on 003-alpha-thrice. Rust approve does not stack approvals yet.",
            ),
        },
        Row {
            name: "declared-archived-branch",
            setup: archived_branch,
            query: "2",
            folder: GAMMA,
            refusal: Some(
                "Change 002-gamma would stack on 001-alpha-twice. Rust approve does not stack approvals yet.",
            ),
        },
        Row {
            name: "declared-overlap",
            setup: approved_thrice_depends,
            query: "1",
            folder: ALPHA,
            refusal: Some(
                "Change 001-alpha-twice would stack on 003-alpha-thrice. Rust approve does not stack approvals yet.",
            ),
        },
        Row {
            name: "declared-landed",
            setup: landed_alpha,
            query: "2",
            folder: GAMMA,
            refusal: None,
        },
    ];
    for row in rows {
        let repo = build_with(row.name, &[], row.setup);
        let before = (branches(&repo.path), worktrees(&repo.path));
        let result = approve(&repo.path, &[row.query]);
        check(&repo, &row, &before, &result);
    }
}

/// Proves a checkout approval marker counts as an approved dependency.
///
/// Covers: rust-approve/stacking-refusals
#[test]
fn checkout_marker_awaits() {
    let repo = build_with("checkout-marker", &[], depends_on_alpha);
    approved_marker(&change(&repo, ALPHA));
    let error = approve(&repo.path, &["2"]).expect_err("the dependency awaits");
    assert_eq!(
        error.to_string(),
        "approve failed: Change 002-gamma would stack on 001-alpha-twice. \
         Rust approve does not stack approvals yet.",
        "the checkout marker makes alpha an awaited dependency"
    );
}

/// Checks one row's outcome and that a refusal left every branch and worktree.
fn check(
    repo: &Repo,
    row: &Row,
    before: &(Vec<String>, Vec<String>),
    result: &Result<osq_core::Output, osq_core::FeatureError>,
) {
    let branch = format!("osq/{}", row.folder);
    if let Some(message) = row.refusal {
        let error = result.as_ref().expect_err("the row is refused");
        assert_eq!(
            error.to_string(),
            format!("approve failed: {message}"),
            "{}: message",
            row.name
        );
        assert_eq!(
            &(branches(&repo.path), worktrees(&repo.path)),
            before,
            "{}: no write",
            row.name
        );
        assert!(
            !branches(&repo.path).contains(&branch),
            "{}: no branch for {branch}",
            row.name
        );
    } else {
        result.as_ref().expect("the row approves");
        assert!(
            branches(&repo.path).contains(&branch),
            "{}: the branch {branch} exists",
            row.name
        );
    }
}

/// Approves the alpha change, then makes the gamma change depend on it.
fn alpha_then_depends(repo: &Repo) {
    let result = approve(&repo.path, &["1"]);
    assert!(
        result.is_ok(),
        "the first approve gives an Output: {:?}",
        result.err()
    );
    depends_on(repo, GAMMA, "\"001\"");
}

/// Makes the gamma change's proposal depend on `001`.
fn depends_on_alpha(repo: &Repo) {
    depends_on(repo, GAMMA, "\"001\"");
}

/// Adds a copy of the alpha change as `003-alpha-thrice` and approves it.
fn thrice_then_approved(repo: &Repo) {
    add_thrice(repo);
    let result = approve(&repo.path, &["3"]);
    assert!(result.is_ok(), "the copy is approved");
}

/// Approves the gamma change.
fn approve_gamma(repo: &Repo) {
    let result = approve(&repo.path, &["2"]);
    assert!(result.is_ok(), "the gamma change is approved");
}

/// Leaves an approved copy of the alpha change under the stacked root.
fn stacked_thrice(repo: &Repo) {
    let target = repo
        .root
        .join("worktrees/repo/.stacked")
        .join(THRICE)
        .join("openspec/changes")
        .join(THRICE);
    copy_tree(&change(repo, ALPHA), &target);
    approved_marker(&target);
}

/// Makes gamma depend on alpha, and archives alpha on its branch.
fn archived_branch(repo: &Repo) {
    depends_on(repo, GAMMA, "\"001\"");
    git(&repo.path, &["checkout", "-q", "-b", "osq/001-alpha-twice"]);
    let target = repo.path.join("openspec/changes/archive").join(ALPHA);
    approved_marker(&target);
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
    approved_marker(&target);
    git(
        &repo.path,
        &["add", "openspec/changes/archive/001-alpha-twice"],
    );
    git(&repo.path, &["commit", "-q", "-m", "archive alpha"]);
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
fn change(repo: &Repo, folder: &str) -> std::path::PathBuf {
    repo.path.join("openspec/changes").join(folder)
}

/// Writes an approval marker into a folder, creating its `.run` folder.
fn approved_marker(folder: &Path) {
    let run = folder.join(".run");
    fs::create_dir_all(&run).expect("the .run folder is created");
    fs::write(run.join("approved"), "sealed\n").expect("the marker is written");
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
