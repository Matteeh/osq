//! Proves how the inbox reads an autopilot stop's change as a change id.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_inbox::InboxFeature;

/// A fresh scratch project root, with anything at that name removed.
fn project(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// A fresh empty scratch home under `CARGO_TARGET_TMPDIR`, named after `root`.
fn home_for(root: &Path) -> PathBuf {
    let base = Path::new(env!("CARGO_TARGET_TMPDIR"));
    let name = root
        .strip_prefix(base)
        .unwrap_or(root)
        .to_string_lossy()
        .replace(['/', '\\'], "_");
    let home = base.join(format!("{name}_home"));
    let _ = fs::remove_dir_all(&home);
    fs::create_dir_all(&home).unwrap();
    home
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// Runs the inbox command on a root with a scratch home.
fn inbox_text(root: &Path) -> String {
    let invocation = Invocation::new(root, "inbox", Vec::new());
    InboxFeature::new()
        .with_home(home_for(root))
        .run(&invocation)
        .expect("inbox succeeds")
        .text
}

/// The full text three line groups give.
fn text(needs_you: &[&str]) -> String {
    let mut text = String::from("Needs you\n");
    for line in needs_you {
        text.push_str(line);
        text.push('\n');
    }
    text.push_str("Running\n  (none)\nLanded since last look\n  (none)\n");
    text
}

/// Writes an archived change with a title and no archived event.
fn archived(root: &Path, folder: &str, title: &str) -> PathBuf {
    let dir = root.join("openspec/changes/archive").join(folder);
    write(
        &dir.join("proposal.md"),
        &format!("---\ntitle: {title}\nverify: cargo test\n---\n## Goal\n\nArchived.\n"),
    );
    dir
}

/// Writes `openspec/.run/autopilot-stop.md`.
fn stop(root: &Path, change: &str) {
    write(
        &root.join("openspec/.run/autopilot-stop.md"),
        &format!(
            "---\nreason: halted\nitem: stopped-item\nchange: \"{change}\"\ncommand: osq retry 040 1\nat: 2026-10-22T10:00:00.000Z\n---\n"
        ),
    );
}

/// Proves an autopilot stop whose change is not a change id names no folder.
///
/// Covers: rust-inbox/autopilot-stop-naming-a-change-that-is-not-a-change-id
#[test]
fn autopilot_stop_naming_a_change_that_is_not_a_change_id() {
    let cases = [
        ("040]", "040]"),
        ("040-stopped-x", "040-stopped-x"),
        ("040-stopped", "Stopped"),
    ];
    for (change, title) in cases {
        let name = format!("inbox_change_ids_{}", change.replace(']', "bracket"));
        let root = project(&name);
        archived(&root, "040-stopped", "Stopped");
        write(
            &root.join("openspec/queue.md"),
            "# q\n\n## [next-item] The next item\n\nDepends on: nothing\n\n### Goal\n\nX.\n",
        );
        stop(&root, change);
        let line = format!("  {change}: {title} — autopilot stopped: halted — osq retry 040 1");
        assert_eq!(inbox_text(&root), text(&[&line]), "{change}");
    }
}
