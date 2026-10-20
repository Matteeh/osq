//! Proves the loop's reading of active changes into core's scheduler.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::ScheduleState;
use osq_kernel_loop::{ActiveChange, ActiveSchedule, ActiveState, LoopError, active_schedule};

/// The fixture repository of one scenario.
fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

/// Builds one expected active change.
fn change(id: &str, folder: &str, state: ActiveState) -> ActiveChange {
    ActiveChange {
        id: id.to_string(),
        folder: folder.to_string(),
        state,
    }
}

/// Builds a queued expected state.
fn queued(state: ScheduleState) -> ActiveState {
    ActiveState::Queued(state)
}

/// Creates an empty temporary project for an edge test.
fn temp_project(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    root
}

/// Writes one file of a temporary project, creating its folders.
fn write_file(root: &Path, relative: &str, text: &str) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// Builds one task file text with the given scope entries.
fn task(scope: &str) -> String {
    format!("---\ntitle: \"Task\"\nscope: [{scope}]\n---\n")
}

/// Proves every row of "States of the fixture repository", its display text and
/// the started changes.
///
/// Covers: rust-loop/states-of-the-fixture-repository
#[test]
fn states_of_the_fixture_repository() {
    let expected = vec![
        change(
            "002",
            "002-unapproved",
            queued(ScheduleState::NeedsApproval),
        ),
        change(
            "003",
            "003-waiting",
            queued(ScheduleState::WaitingOn("004".to_string())),
        ),
        change("004", "004-running", ActiveState::Running),
        change(
            "005",
            "005-blocked",
            queued(ScheduleState::BlockedBy {
                id: "004".to_string(),
                shared: vec!["src/a.ts".to_string(), "src/b.ts".to_string()],
            }),
        ),
        change("006", "006-glob", queued(ScheduleState::Ready)),
        change(
            "007",
            "007-crate",
            queued(ScheduleState::BlockedBy {
                id: "006".to_string(),
                shared: vec!["crates/kernel/demo".to_string()],
            }),
        ),
        change("008", "008-started", ActiveState::Running),
        change("009", "009-nothing", queued(ScheduleState::Ready)),
    ];
    let displays = [
        "needs approval",
        "waiting on 004",
        "running",
        "blocked by 004: src/a.ts, src/b.ts",
        "ready",
        "blocked by 006: crates/kernel/demo",
        "running",
        "ready",
    ];
    let schedule = active_schedule(&fixture("repo")).unwrap();
    assert_eq!(schedule.changes, expected);
    for (found, display) in schedule.changes.iter().zip(displays) {
        assert_eq!(found.state.to_string(), display, "change {}", found.folder);
    }
    assert_eq!(schedule.start, vec!["006", "009"]);
}

/// Proves a project whose changes folder does not exist has nothing to show.
///
/// Covers: rust-loop/project-without-changes
#[test]
fn project_without_changes() {
    let schedule = active_schedule(&fixture("missing")).unwrap();
    assert_eq!(
        schedule,
        ActiveSchedule {
            changes: Vec::new(),
            start: Vec::new(),
        }
    );
}

/// Proves a task file that does not parse is a storage error naming that file.
///
/// Covers: rust-loop/unreadable-task-file
#[test]
fn unreadable_task_file() {
    let error = active_schedule(&fixture("broken")).unwrap_err();
    let LoopError::Storage(storage) = &error else {
        panic!("expected a storage error, got {error}");
    };
    let task = fixture("broken").join("openspec/changes/001-broken/tasks/1.md");
    assert!(storage.to_string().contains(&task.display().to_string()));
    assert!(error.to_string().contains(&task.display().to_string()));
    assert!(std::error::Error::source(&error).is_some());
}

/// Proves an archived folder name and an unapproved change with a done task are
/// read as the requirement says, which the fixture table cannot show.
///
/// Covers: rust-loop/states-of-the-fixture-repository
#[test]
fn archived_folder_name_and_unapproved_markers() {
    let root = temp_project("loop_active_edges");
    write_file(
        &root,
        "openspec/changes/archive/landed/proposal.md",
        "---\ntitle: \"Landed\"\n---\n",
    );
    write_file(
        &root,
        "openspec/changes/002-deps/proposal.md",
        "---\ntitle: \"Deps\"\ndepends_on: [\"landed\"]\n---\n",
    );
    write_file(
        &root,
        "openspec/changes/002-deps/tasks/1.md",
        &task("\"src/a.ts\""),
    );
    write_file(&root, "openspec/changes/002-deps/.run/approved", "");
    write_file(
        &root,
        "openspec/changes/003-unapproved/tasks/1.md",
        &task("\"src/a.ts\""),
    );
    write_file(&root, "openspec/changes/003-unapproved/.run/done/1", "");
    write_file(
        &root,
        "openspec/changes/004-noprop/tasks/1.md",
        &task("\"src/b.ts\""),
    );
    write_file(&root, "openspec/changes/004-noprop/.run/approved", "");

    let schedule = active_schedule(&root).unwrap();
    let expected = vec![
        change("002", "002-deps", queued(ScheduleState::Ready)),
        change(
            "003",
            "003-unapproved",
            queued(ScheduleState::NeedsApproval),
        ),
        change("004", "004-noprop", queued(ScheduleState::Ready)),
    ];
    assert_eq!(schedule.changes, expected);
    assert_eq!(schedule.start, vec!["002", "004"]);
}

/// Proves a proposal that exists but does not read is a specs error naming it.
///
/// Covers: rust-loop/states-of-the-fixture-repository
#[test]
fn unreadable_proposal() {
    let root = temp_project("loop_active_proposal");
    write_file(
        &root,
        "openspec/changes/001-bad/proposal.md",
        "---\ntitle: [\n---\n",
    );
    write_file(
        &root,
        "openspec/changes/001-bad/tasks/1.md",
        &task("\"src/a.ts\""),
    );
    let error = active_schedule(&root).unwrap_err();
    assert!(matches!(error, LoopError::Specs(_)));
    let proposal = root.join("openspec/changes/001-bad/proposal.md");
    assert!(error.to_string().contains(&proposal.display().to_string()));
    assert!(std::error::Error::source(&error).is_some());
}
