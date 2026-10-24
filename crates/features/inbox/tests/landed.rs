//! Proves the Landed since last look group's lines.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_inbox::InboxFeature;

/// A fresh temporary project root, with anything at that name removed.
fn temp_root(name: &str) -> PathBuf {
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

/// Runs the inbox command on a root.
fn inbox_text(root: &Path) -> String {
    let invocation = Invocation::new(root, "inbox", Vec::new());
    InboxFeature::new()
        .with_home(home_for(root))
        .run(&invocation)
        .expect("inbox succeeds")
        .text
}

/// The full text landed lines give without needs-you or running items.
fn landed_text(lines: &[&str]) -> String {
    let mut text = String::from("Needs you\n  (none)\nRunning\n  (none)\nLanded since last look\n");
    for line in lines {
        text.push_str(line);
        text.push('\n');
    }
    text
}

/// Writes an archived change folder with its proposal title.
fn archived(root: &Path, folder: &str, title: Option<&str>) {
    let dir = root.join("openspec/changes/archive").join(folder);
    let frontmatter = title.map_or_else(String::new, |title| format!("title: {title}\n"));
    write(
        &dir.join("proposal.md"),
        &format!("---\n{frontmatter}verify: cargo test\n---\n## Goal\n\nArchived.\n"),
    );
}

/// Writes an archived change's `archived` event.
fn archive_event(root: &Path, folder: &str, timestamp: &str) {
    let dir = root.join("openspec/changes/archive").join(folder);
    write(
        &dir.join(".run/events/change.jsonl"),
        &format!(
            "{{\"type\":\"archived\",\"timestamp\":\"{timestamp}\",\"data\":{{\"archivePath\":\"openspec/changes/archive/{folder}\"}}}}\n"
        ),
    );
}

/// Covers: rust-inbox/newest-ten-landed-changes
#[test]
fn newest_ten_landed_changes() {
    let root = temp_root("inbox_newest_ten_landed_changes");
    for number in 101..=112 {
        let letter = char::from(b'a' + u8::try_from(number - 101).unwrap());
        let folder = format!("{number}-{letter}");
        let title = letter.to_ascii_uppercase().to_string();
        archived(&root, &folder, Some(&title));
        if number != 112 {
            let day = if number == 111 { 110 } else { number };
            archive_event(
                &root,
                &folder,
                &format!("2026-10-{:02}T10:00:00.000Z", day - 100),
            );
        }
    }
    assert_eq!(
        inbox_text(&root),
        landed_text(&[
            "  110: J — archived 2026-10-10T10:00:00.000Z — osq show 110",
            "  111: K — archived 2026-10-10T10:00:00.000Z — osq show 111",
            "  109: I — archived 2026-10-09T10:00:00.000Z — osq show 109",
            "  108: H — archived 2026-10-08T10:00:00.000Z — osq show 108",
            "  107: G — archived 2026-10-07T10:00:00.000Z — osq show 107",
            "  106: F — archived 2026-10-06T10:00:00.000Z — osq show 106",
            "  105: E — archived 2026-10-05T10:00:00.000Z — osq show 105",
            "  104: D — archived 2026-10-04T10:00:00.000Z — osq show 104",
            "  103: C — archived 2026-10-03T10:00:00.000Z — osq show 103",
            "  102: B — archived 2026-10-02T10:00:00.000Z — osq show 102",
        ])
    );
}

/// Covers: rust-inbox/newest-ten-landed-changes
#[test]
fn landed_disclosures() {
    let root = temp_root("inbox_landed_disclosures");
    archived(&root, "030-mixed", Some("Mixed"));
    archive_event(&root, "030-mixed", "2026-10-03T10:00:00.000Z");
    let folder = root.join("openspec/changes/archive/030-mixed");
    write(&folder.join(".run/results/1.md"), "## Deviated\n\nOne.\n");
    write(
        &folder.join(".run/results/2.md"),
        "## Deviated\n\nTwo.\n\n## Missing context\n\nThree.\n",
    );
    write(
        &folder.join(".run/results/3.md"),
        "## Outside scope\n\nFour.\n",
    );
    archived(&root, "029-quiet", Some("Quiet"));
    archive_event(&root, "029-quiet", "2026-10-02T10:00:00.000Z");
    write(
        &root.join("openspec/changes/archive/029-quiet/.run/results/1.md"),
        "## Changed\n\nNothing.\n",
    );
    assert_eq!(
        inbox_text(&root),
        landed_text(&[
            "  030: Mixed — archived 2026-10-03T10:00:00.000Z — disclosed: deviated 2, missing context 1, outside scope 1 — osq show 030",
            "  029: Quiet — archived 2026-10-02T10:00:00.000Z — osq show 029",
        ])
    );
}

/// Covers: rust-inbox/newest-ten-landed-changes
#[test]
fn landed_id_tie_break_uses_leading_number() {
    let root = temp_root("inbox_landed_id_tie_break");
    archived(&root, "2-b", Some("B"));
    archive_event(&root, "2-b", "2026-10-05T10:00:00.000Z");
    archived(&root, "10-a", Some("A"));
    archive_event(&root, "10-a", "2026-10-05T10:00:00.000Z");
    assert_eq!(
        inbox_text(&root),
        landed_text(&[
            "  2: B — archived 2026-10-05T10:00:00.000Z — osq show 2",
            "  10: A — archived 2026-10-05T10:00:00.000Z — osq show 10",
        ])
    );
}

/// Covers: rust-inbox/newest-ten-landed-changes
#[test]
fn landed_id_and_title_fall_back_to_folder() {
    let root = temp_root("inbox_landed_id_and_title_fall_back_to_folder");
    archived(&root, "quiet-one", None);
    archive_event(&root, "quiet-one", "2026-10-04T10:00:00.000Z");
    assert_eq!(
        inbox_text(&root),
        landed_text(&[
            "  quiet-one: quiet-one — archived 2026-10-04T10:00:00.000Z — osq show quiet-one"
        ])
    );
}
