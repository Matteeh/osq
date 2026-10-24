//! Proves the halt markers, running locks and blocked sections a change holds.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{
    ChangeSnapshot, HaltMarker, Location, RunningLock, TaskFile, list_changes, read_change,
};

/// A fresh temporary project root, with anything at that name removed.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// The one active change folder of a temporary project, read into its snapshot.
fn read_active(root: &Path, folder: &str) -> ChangeSnapshot {
    let entry = list_changes(root)
        .into_iter()
        .find(|entry| entry.folder == folder && entry.location == Location::Active)
        .expect("the change folder is listed");
    read_change(&entry).unwrap()
}

/// One task of a snapshot, by its id.
fn task<'a>(snapshot: &'a ChangeSnapshot, id: &str) -> &'a TaskFile {
    snapshot
        .tasks
        .iter()
        .find(|task| task.id.as_str() == id)
        .expect("the task exists")
}

/// The `050-halted` change folder its scenario names, read into a snapshot.
fn halted_snapshot() -> ChangeSnapshot {
    let root = temp_root("reading_markers_halted");
    let dir = root.join("openspec/changes/050-halted");
    write(
        &dir.join("proposal.md"),
        "---\ntitle: \"050-halted\"\n---\n",
    );
    for number in 1..=5 {
        write(
            &dir.join(format!("tasks/{number}.md")),
            &format!("---\ntitle: \"Task {number}\"\n---\n"),
        );
    }
    write(
        &dir.join(".run/dead/1.md"),
        "---\nreason: blocked\n---\nBlocked.\n",
    );
    write(
        &dir.join(".run/results/1.md"),
        "## Blocked\n\nNeed the key.\n",
    );
    write(
        &dir.join(".run/dead/2.md"),
        "---\nreason: timeout\nfingerprint: sha256:2\nstuck: true\n---\nTimed out:\n- a.rs\n-   b.rs  \n- \nc.rs\n",
    );
    write(
        &dir.join(".run/regressed/3.md"),
        "---\nreason: scope_regression\nverification_passed: true\n---\n",
    );
    write(
        &dir.join(".run/regressed/change.md"),
        "---\nreason: verify_red\n---\n",
    );
    write(
        &dir.join(".run/running/4.pid"),
        "{\"pid\":4242,\"startedAt\":1760000000000}",
    );
    write(&dir.join(".run/dead/5.md"), "crashed");
    write(&dir.join(".run/dead/3.1.md"), "---\nreason: crashed\n---\n");
    read_active(&root, "050-halted")
}

/// Proves the dead, regressed, lock and blocked facts of a halted change.
///
/// Covers: rust-storage/markers-of-a-halted-change
#[test]
fn markers_of_a_halted_change() {
    let snapshot = halted_snapshot();
    assert_eq!(
        task(&snapshot, "1").markers.dead,
        Some(HaltMarker {
            reason: String::from("blocked"),
            stuck: false,
            verification_passed: false,
            fingerprint: None,
            entries: Vec::new(),
        })
    );
    assert_eq!(
        task(&snapshot, "1").markers.blocked.as_deref(),
        Some("Need the key.")
    );
    assert_eq!(
        task(&snapshot, "2").markers.dead,
        Some(HaltMarker {
            reason: String::from("timeout"),
            stuck: true,
            verification_passed: false,
            fingerprint: Some(String::from("sha256:2")),
            entries: vec![String::from("a.rs"), String::from("b.rs")],
        })
    );
    assert_eq!(
        task(&snapshot, "3").markers.regressed,
        Some(HaltMarker {
            reason: String::from("scope_regression"),
            stuck: false,
            verification_passed: true,
            fingerprint: None,
            entries: Vec::new(),
        })
    );
    assert_eq!(task(&snapshot, "3").markers.dead, None);
    assert_eq!(
        task(&snapshot, "4").markers.lock,
        Some(RunningLock {
            pid: 4242,
            started_at_ms: 1_760_000_000_000,
        })
    );
    assert_eq!(
        task(&snapshot, "5").markers.dead,
        Some(HaltMarker {
            reason: String::new(),
            stuck: false,
            verification_passed: false,
            fingerprint: None,
            entries: Vec::new(),
        })
    );
    assert_eq!(task(&snapshot, "5").markers.lock, None);
    assert_eq!(
        snapshot.change_regressed,
        Some(HaltMarker {
            reason: String::from("verify_red"),
            stuck: false,
            verification_passed: false,
            fingerprint: None,
            entries: Vec::new(),
        })
    );
}

/// Proves wrong-typed marker and lock files read as empty facts or no lock.
///
/// Covers: rust-storage/markers-that-do-not-read
#[test]
fn markers_that_do_not_read() {
    let root = temp_root("reading_markers_odd");
    let dir = root.join("openspec/changes/051-odd");
    write(&dir.join("proposal.md"), "---\ntitle: \"051-odd\"\n---\n");
    for number in 1..=4 {
        write(
            &dir.join(format!("tasks/{number}.md")),
            &format!("---\ntitle: \"Task {number}\"\n---\n"),
        );
    }
    write(
        &dir.join(".run/dead/1.md"),
        "---\nreason: 7\nstuck: \"yes\"\n---\n",
    );
    write(&dir.join(".run/running/2.pid"), "not json");
    write(
        &dir.join(".run/running/3.pid"),
        "{\"pid\":\"9\",\"startedAt\":1}",
    );
    write(
        &dir.join(".run/running/4.pid"),
        "{\"pid\":9,\"startedAt\":1.5}",
    );
    let snapshot = read_active(&root, "051-odd");
    assert_eq!(
        task(&snapshot, "1").markers.dead,
        Some(HaltMarker {
            reason: String::new(),
            stuck: false,
            verification_passed: false,
            fingerprint: None,
            entries: Vec::new(),
        })
    );
    assert_eq!(task(&snapshot, "2").markers.lock, None);
    assert_eq!(task(&snapshot, "3").markers.lock, None);
    assert_eq!(task(&snapshot, "4").markers.lock, None);
    assert_eq!(task(&snapshot, "1").markers.lock, None);
    assert_eq!(task(&snapshot, "1").markers.blocked, None);
    assert_eq!(snapshot.change_regressed, None);
}
