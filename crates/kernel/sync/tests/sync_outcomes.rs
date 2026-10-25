//! Proves the three outcomes a sync returns.

mod support;

use osq_core::event::SyncStopReason;
use osq_kernel_sync::{SyncKind, SyncOptions, SyncOutcome, SyncStop};
use support::SyncRepo;

/// The options "Sync outcomes" uses.
fn options() -> SyncOptions {
    SyncOptions {
        records: false,
        verify: true,
        tasks: None,
    }
}

/// Proves the row whose default branch added no commit.
///
/// Covers: rust-sync/sync-outcomes
#[test]
fn already_synced_writes_nothing() {
    let repo = SyncRepo::new("sync-outcomes-already");
    let change = repo.add_archived_change("001-alpha-orders", "true");
    let branch = repo.head(&change.path);

    let result = SyncRepo::sync(&change, SyncKind::Archived, options());

    assert_eq!(result, Ok(SyncOutcome::AlreadySynced));
    assert_eq!(repo.head(&change.path), branch);
}

/// Proves the row whose default branch added a commit.
///
/// Covers: rust-sync/sync-outcomes
#[test]
fn synced_returns_the_merge_commit() {
    let repo = SyncRepo::new("sync-outcomes-synced");
    let change = repo.add_archived_change("001-alpha-orders", "true");
    let branch = repo.head(&change.path);
    repo.main_file("other.txt", "other\n", "main adds other");

    let result = SyncRepo::sync(&change, SyncKind::Archived, options());

    let commit = match result {
        Ok(SyncOutcome::Synced { commit }) => commit,
        other => panic!("the sync commits: {other:?}"),
    };
    assert_eq!(repo.head(&change.path), commit);
    assert_ne!(commit, branch);
    assert_eq!(
        repo.message(&commit),
        "osq: 001 sync main\n\nOsq-Change: 001-alpha-orders\n"
    );
    assert_eq!(repo.read(&change.path, "other.txt"), "other\n");
}

/// Proves the row whose default branch changed the same source file.
///
/// Covers: rust-sync/sync-outcomes
#[test]
fn conflict_returns_its_paths_and_leaves_the_branch() {
    let repo = SyncRepo::new("sync-outcomes-conflict");
    let change = repo.add_archived_change("001-alpha-orders", "true");
    let branch = repo.head(&change.path);
    repo.main_file("src/one.txt", "main\n", "main edits one");

    let result = SyncRepo::sync(&change, SyncKind::Archived, options());

    assert_eq!(
        result,
        Err(SyncStop {
            reason: SyncStopReason::SyncConflict,
            message: "001-alpha-orders: src/one.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main".to_owned(),
            conflicts: vec!["src/one.txt".to_owned()],
        })
    );
    assert_eq!(repo.head(&change.path), branch);
    assert!(!repo.git_path(&change.path, "MERGE_HEAD").exists());
}
