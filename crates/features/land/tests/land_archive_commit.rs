//! Proves land refuses a change whose archive commit failed before it reports.

mod support;

use support::{ChangeTree, FIXTURE_FOLDER, LandRepo};

/// A path inside one change's archived folder.
fn archive_path(change: &ChangeTree, relative: &str) -> String {
    format!("openspec/changes/archive/{}/{relative}", change.folder)
}

/// Writes the row's uncommitted regressed marker into the archived folder.
fn write_marker(repo: &LandRepo, change: &ChangeTree, marker: &str) {
    repo.write(
        &change.path,
        &archive_path(change, ".run/regressed/change.md"),
        marker,
    );
}

/// Asserts land refused with `expected`, leaving `main`, the worktree's files
/// and its status as they were.
fn assert_refused(repo: &LandRepo, change: &ChangeTree, name: &str, expected: &str) {
    let head = repo.head(repo.checkout());
    let files = repo.snapshot(&change.path);
    let status = repo.git(&change.path, &["status", "--porcelain"]);
    let error = repo.run("1").expect_err(name);
    assert_eq!(
        error.to_string(),
        format!("land failed: {expected}"),
        "{name}"
    );
    assert_eq!(repo.head(repo.checkout()), head, "{name}: main unchanged");
    assert_eq!(
        repo.snapshot(&change.path),
        files,
        "{name}: worktree files unchanged"
    );
    assert_eq!(
        repo.git(&change.path, &["status", "--porcelain"]),
        status,
        "{name}: worktree status unchanged"
    );
}

/// Proves every row of "Land on a failed archive commit".
///
/// Covers: rust-land/land-on-a-failed-archive-commit
#[test]
fn land_on_a_failed_archive_commit() {
    let rows = [
        (
            "commit failed",
            "---\nreason: commit_failed\n---\nrefused by hook\n",
            None,
        ),
        (
            "commit failed with surrounding spaces",
            "---\nreason:  commit_failed \n---\n",
            None,
        ),
        (
            "another regression",
            "---\nreason: sync_conflict\n---\nconflict\n",
            Some("openspec/changes/archive/001-alpha-orders/.run/regressed/change.md"),
        ),
    ];
    for (index, (name, marker, uncommitted)) in rows.into_iter().enumerate() {
        let repo = LandRepo::new(&format!("archive-commit-{index}"));
        let change = repo.add_fixture_change();
        write_marker(&repo, &change, marker);
        let expected = match uncommitted {
            None => format!(
                "{FIXTURE_FOLDER}'s archive commit failed; fix the cause, then run osq retry 001 change"
            ),
            Some(path) => format!(
                "{} has uncommitted changes: {path}; commit or discard them first",
                change.path.display()
            ),
        };
        assert_refused(&repo, &change, name, &expected);
    }
}
