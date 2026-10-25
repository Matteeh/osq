//! Proves the three options choose what a sync records, verifies and picks.

mod support;

use osq_core::event::SyncStopReason;
use osq_kernel_sync::{SyncKind, SyncOptions, SyncOutcome, SyncStop};
use support::{ChangeTree, SyncRepo};

/// The alpha change's delta, as the land goldens write it.
const ALPHA_DELTA: &str = "## ADDED Requirements\n\n### Requirement: Alpha\nThe system SHALL alpha.\n\n#### Scenario: Alpha works\n- **WHEN** alpha\n- **THEN** alpha\n";

/// The orders spec with one requirement `name` and its lowercase body.
fn orders_spec(name: &str) -> String {
    let lower = name.to_lowercase();
    format!(
        "# orders Specification\n\n## Purpose\n\nOrders.\n\n## Requirements\n\n### Requirement: {name}\nThe system SHALL {lower}.\n\n#### Scenario: {name} works\n- **WHEN** {lower}\n- **THEN** {lower}\n"
    )
}

/// The options one row names.
fn options(records: bool, verify: bool, tasks: Option<&[&str]>) -> SyncOptions {
    SyncOptions {
        records,
        verify,
        tasks: tasks.map(|ids| ids.iter().map(|id| (*id).to_owned()).collect()),
    }
}

/// Whether a task stream holds a `verify_ran` event, or missing text has none.
fn verify_ran(repo: &SyncRepo, change: &ChangeTree, relative: &str) -> bool {
    if !repo.exists(&change.path, relative) {
        return false;
    }
    repo.read(&change.path, relative)
        .lines()
        .any(|line| line.contains("\"verify_ran\""))
}

/// Proves the row that runs verify with a red proposal command.
///
/// Covers: rust-sync/options-chosen-by-the-caller
#[test]
fn archived_verify_true_stops_red() {
    let repo = SyncRepo::new("options-archived-red");
    let change = repo.add_archived_change("001-alpha-orders", "false");
    let branch = repo.head(&change.path);
    repo.main_file("other.txt", "other\n", "main adds other");

    let result = SyncRepo::sync(&change, SyncKind::Archived, options(false, true, None));

    assert!(matches!(
        result,
        Err(SyncStop {
            reason: SyncStopReason::SyncVerifyRed,
            ..
        })
    ));
    assert_eq!(repo.head(&change.path), branch);
}

/// Proves the row that turns verify off.
///
/// Covers: rust-sync/options-chosen-by-the-caller
#[test]
fn archived_verify_false_writes_no_verify_log_or_event() {
    let repo = SyncRepo::new("options-archived-no-verify");
    let change = repo.add_archived_change("001-alpha-orders", "false");
    repo.main_file("other.txt", "other\n", "main adds other");

    let result = SyncRepo::sync(&change, SyncKind::Archived, options(false, false, None));

    assert!(matches!(result, Ok(SyncOutcome::Synced { .. })));
    assert!(!repo.exists(
        &change.path,
        "openspec/changes/archive/001-alpha-orders/.run/logs"
    ));
    assert!(!verify_ran(
        &repo,
        &change,
        "openspec/changes/archive/001-alpha-orders/.run/events/change.jsonl"
    ));
}

/// Proves the row that records a conflict stop on the change's branch.
///
/// Covers: rust-sync/options-chosen-by-the-caller
#[test]
fn records_true_commits_the_stop_record() {
    let repo = SyncRepo::new("options-recorded-conflict");
    let change = repo.add_archived_change("001-alpha-orders", "true");
    let branch = repo.head(&change.path);
    repo.main_file("src/one.txt", "main\n", "main edits one");

    let result = SyncRepo::sync(&change, SyncKind::Archived, options(true, true, None));

    assert!(matches!(
        result,
        Err(SyncStop {
            reason: SyncStopReason::SyncConflict,
            conflicts,
            ..
        }) if conflicts == vec!["src/one.txt".to_owned()]
    ));
    let commit = repo.head(&change.path);
    assert_ne!(commit, branch);
    assert_eq!(repo.message(&commit), "osq: 001 land stopped\n");
    let marker = repo.git(
        &change.path,
        &[
            "show",
            &format!("{commit}:openspec/changes/archive/001-alpha-orders/.run/regressed/change.md"),
        ],
    );
    assert!(marker.contains("reason: sync_conflict"), "{marker}");
}

/// Proves the active row that verifies a red task with no task filter.
///
/// Covers: rust-sync/options-chosen-by-the-caller
#[test]
fn active_verify_true_stops_on_the_red_task() {
    let repo = SyncRepo::new("options-active-red");
    let change = repo.add_active_change("001-alpha-orders", &[(1, "false"), (2, "true")]);
    let branch = repo.head(&change.path);
    repo.main_file("other.txt", "other\n", "main adds other");

    let result = SyncRepo::sync(&change, SyncKind::Active, options(false, true, None));

    assert!(matches!(
        result,
        Err(SyncStop {
            reason: SyncStopReason::SyncVerifyRed,
            ..
        })
    ));
    assert_eq!(repo.head(&change.path), branch);
}

/// Proves the active row that keeps only the task its caller names.
///
/// Covers: rust-sync/options-chosen-by-the-caller
#[test]
fn active_tasks_keep_only_the_named_task() {
    let repo = SyncRepo::new("options-active-picked");
    repo.main_file(
        "openspec/specs/orders/spec.md",
        orders_spec("Beta"),
        "main adds beta",
    );
    let change = repo.add_active_change("001-alpha-orders", &[(1, "false"), (2, "true")]);
    repo.write(
        &change.path,
        "openspec/changes/001-alpha-orders/specs/orders/spec.md",
        ALPHA_DELTA,
    );
    repo.commit_all(&change.path, "branch adds alpha delta");
    repo.main_file("other.txt", "other\n", "main adds other");

    let result = SyncRepo::sync(
        &change,
        SyncKind::Active,
        options(false, true, Some(&["2"])),
    );

    assert!(matches!(result, Ok(SyncOutcome::Synced { .. })));
    assert_eq!(
        repo.read(&change.path, "openspec/specs/orders/spec.md"),
        orders_spec("Beta"),
        "an active sync leaves the default branch's living spec"
    );
    assert!(!verify_ran(
        &repo,
        &change,
        "openspec/changes/001-alpha-orders/.run/events/1.jsonl"
    ));
}
