//! Proves the land commit, the fast-forward and the paths a land reports.

mod support;

use std::fmt::Write;
use std::fs;

use support::LandRepo;

/// The paths "Land from the branch tip" reports, in their order.
const CHANGED: [&str; 12] = [
    "openspec/changes/archive/001-alpha-orders/.run/approved",
    "openspec/changes/archive/001-alpha-orders/.run/approver",
    "openspec/changes/archive/001-alpha-orders/.run/base",
    "openspec/changes/archive/001-alpha-orders/.run/done/1",
    "openspec/changes/archive/001-alpha-orders/.run/done/2",
    "openspec/changes/archive/001-alpha-orders/.run/events/1.jsonl",
    "openspec/changes/archive/001-alpha-orders/.run/events/2.jsonl",
    "openspec/changes/archive/001-alpha-orders/.run/events/change.jsonl",
    "openspec/changes/archive/001-alpha-orders/proposal.md",
    "openspec/changes/archive/001-alpha-orders/specs/orders/spec.md",
    "openspec/changes/archive/001-alpha-orders/tasks.md",
    "src/one.txt",
];

/// The commit a land output names.
fn landed_commit(output: &str) -> String {
    output
        .lines()
        .next()
        .and_then(|line| line.rsplit_once(" as "))
        .map(|(_, commit)| commit.to_owned())
        .expect("the output names the land commit")
}

/// Proves "Land from the branch tip", its author, tree and changed paths.
///
/// Covers: rust-land/land-from-the-branch-tip
#[test]
fn land_from_the_branch_tip() {
    let repo = LandRepo::new("land_from_tip");
    let change = repo.add_fixture_change();
    let old_main = repo.head(repo.checkout());
    let tip = repo.branch_head("osq/001-alpha-orders");
    let tip_tree = repo.tree(&change.path, "HEAD");

    repo.write(repo.checkout(), "notes.txt", "modified\n");
    repo.write(repo.checkout(), "staged.txt", "staged\n");
    repo.git(repo.checkout(), &["add", "staged.txt"]);
    repo.write(repo.checkout(), "drafts/x", "draft\n");

    let output = repo.run("1").expect("the land succeeds").text;
    let commit = landed_commit(&output);
    let mut expected =
        format!("Landed 001-alpha-orders as {commit}\nKept branch osq/001-alpha-orders\n");
    for path in CHANGED {
        writeln!(expected, "Changed {}", repo.checkout().join(path).display())
            .expect("a string writes");
    }
    assert_eq!(output, expected);

    assert_eq!(
        repo.head(repo.checkout()),
        commit,
        "the checkout's HEAD moved"
    );
    assert_ne!(commit, old_main, "main has a new commit");
    let parents = repo.git(
        repo.checkout(),
        &["rev-list", "--parents", "-n", "1", &commit],
    );
    assert_eq!(
        parents.split_whitespace().collect::<Vec<_>>(),
        vec![commit.as_str(), old_main.as_str()],
        "the only parent is the old main"
    );
    assert_eq!(
        repo.tree(repo.checkout(), "HEAD"),
        tip_tree,
        "the tree is the tip's"
    );
    assert_eq!(
        repo.git(
            repo.checkout(),
            &["log", "-1", "--format=%an <%ae>", &commit]
        )
        .trim(),
        "osq <osq@example.invalid>",
        "the author comes from vcs.author"
    );
    assert_eq!(repo.read(repo.checkout(), "src/one.txt"), "two\n");
    assert_eq!(repo.read(repo.checkout(), "notes.txt"), "modified\n");
    assert!(
        repo.git(repo.checkout(), &["diff", "--cached", "--name-only"])
            .contains("staged.txt"),
        "staged.txt stays staged"
    );
    assert!(repo.exists(repo.checkout(), "drafts/x"), "drafts/x remains");
    assert_eq!(
        repo.branch_head("osq/001-alpha-orders"),
        tip,
        "the branch remains"
    );
    assert!(change.path.exists(), "the worktree remains");
}

/// One row of "Land commit stops".
enum Stop {
    /// `main` gained a commit after the branch was cut.
    Moved,
    /// The checkout's `src/one.txt` holds an edit and `osq.toml` keeps edits.
    Blocked,
    /// The checkout's `src/one.txt` holds an edit and `osq.toml` blocks edits.
    BlockedBlock,
}

/// Proves every row of "Land commit stops".
///
/// Covers: rust-land/land-commit-stops
#[test]
fn land_commit_stops() {
    let block_toml =
        "[vcs]\nenabled = true\nauthor = \"osq <osq@example.invalid>\"\nmanualEdits = \"block\"\n";
    let rows = [
        (
            "main moved",
            Stop::Moved,
            "main moved while landing; run osq land 001 again",
        ),
        (
            "checkout file blocks",
            Stop::Blocked,
            "The checkout has uncommitted changes in files this land writes: src/one.txt; keep them with osq manual \"<why>\", or commit or stash them, then run osq land 001 again",
        ),
        (
            "block prevents manual edits",
            Stop::BlockedBlock,
            "The checkout has uncommitted changes in files this land writes: src/one.txt; commit or stash them, then run osq land 001 again",
        ),
    ];
    for (index, (name, stop, expected)) in rows.into_iter().enumerate() {
        let repo = LandRepo::new(&format!("stop-{index}"));
        repo.add_fixture_change();
        match stop {
            Stop::Moved => {
                repo.write(repo.checkout(), "other.txt", "other\n");
                repo.commit(repo.checkout(), "main moves", &["other.txt"]);
            }
            Stop::Blocked => {
                repo.write(repo.checkout(), "src/one.txt", "edit\n");
            }
            Stop::BlockedBlock => {
                repo.write(repo.checkout(), "src/one.txt", "edit\n");
                repo.write(repo.checkout(), "osq.toml", block_toml);
            }
        }
        let before = repo.head(repo.checkout());
        let snapshot = repo.snapshot(repo.checkout());
        let error = repo.run("1").expect_err(name);
        assert_eq!(
            error.to_string(),
            format!("land failed: {expected}"),
            "{name}"
        );
        assert_eq!(repo.head(repo.checkout()), before, "{name}: main unchanged");
        assert_eq!(
            repo.snapshot(repo.checkout()),
            snapshot,
            "{name}: files unchanged"
        );
    }
}

/// Proves "Git refuses the fast-forward".
///
/// Covers: rust-land/git-refuses-the-fast-forward
#[test]
fn git_refuses_the_fast_forward() {
    let repo = LandRepo::new("fast_forward_refused");
    repo.add_fixture_change();
    let before = repo.head(repo.checkout());
    let lock = repo.git_path("index.lock");
    fs::write(&lock, "").expect("the lock file is written");
    let result = repo.run("1");
    let _ = fs::remove_file(&lock);
    let error = result.expect_err("the fast-forward fails");
    assert!(
        error.to_string().contains("index.lock"),
        "the error names index.lock: {error}"
    );
    assert_eq!(repo.head(repo.checkout()), before, "main unchanged");
}
