//! Proves a stop after recertification puts the done marker and events back.

mod support;

use osq_core::event::SyncStopReason;
use osq_kernel_storage::task_scope_hash;
use osq_kernel_sync::{SyncKind, SyncOptions, SyncStop};
use support::SyncRepo;

/// The active change's folder.
const ACTIVE: &str = "openspec/changes/001-alpha-orders";

/// Proves a failed commit restores the files a recertification overwrote.
///
/// Covers: rust-sync/sync-outcomes
#[test]
fn a_stop_restores_the_recertified_files() {
    let repo = SyncRepo::new("sync-restores-recertified");
    let change = repo.add_active_change("001-alpha-orders", &[(1, "true")]);
    repo.write(
        &change.path,
        &format!("{ACTIVE}/tasks/1.md"),
        "---\ntitle: Task 1\nverify: \"true\"\nscope:\n  - src/**\n---\n## Acceptance\n\n- [ ] Task 1 works.\n",
    );
    let _ = std::fs::remove_file(change.path.join(format!("{ACTIVE}/.run/done/1")));
    repo.commit_all(&change.path, "record task one's scope");
    let hash = task_scope_hash(&change.path, &["src/**".to_owned()]);
    let marker = format!(
        "---\nscope_hash: {}\n---\n2026-10-20T08:00:00.000Z\n",
        hash.hash
    );
    repo.write(&change.path, &format!("{ACTIVE}/.run/done/1"), &marker);
    repo.main_file("src/three.txt", "three\n", "main adds three");
    repo.install_failing_hook();

    let result = SyncRepo::sync(
        &change,
        SyncKind::Active,
        SyncOptions {
            records: false,
            verify: true,
            tasks: None,
        },
    );

    assert!(matches!(
        result,
        Err(SyncStop {
            reason: SyncStopReason::SyncFailed,
            ..
        })
    ));
    assert_eq!(
        repo.read(&change.path, &format!("{ACTIVE}/.run/done/1")),
        marker
    );
    assert!(!repo.exists(&change.path, &format!("{ACTIVE}/.run/events/1.jsonl")));
}
