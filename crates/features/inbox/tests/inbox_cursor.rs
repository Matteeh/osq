//! Proves the last-look cursor and the landed changes it selects.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_inbox::InboxFeature;
use osq_kernel_storage::watch_state_dir;

/// A fresh scratch folder under `CARGO_TARGET_TMPDIR`, named `name`.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("inbox_cursor")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// The cursor file path under `home` for `root`.
fn cursor_path(root: &Path, home: &Path) -> PathBuf {
    let state = watch_state_dir(root, home);
    let name = state.file_name().unwrap().to_string_lossy();
    home.join(".osq")
        .join("last-look")
        .join(format!("{name}.json"))
}

/// Writes a cursor file holding `content`.
fn write_cursor(root: &Path, home: &Path, content: &str) {
    write(&cursor_path(root, home), content);
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

/// Builds the twelve archived changes of "Newest ten landed changes".
fn landed_project(root: &Path) {
    for number in 101..=112 {
        let letter = char::from(b'a' + u8::try_from(number - 101).unwrap());
        let folder = format!("{number}-{letter}");
        let title = letter.to_ascii_uppercase().to_string();
        archived(root, &folder, Some(&title));
        if number != 112 {
            let day = if number == 111 { 110 } else { number };
            archive_event(
                root,
                &folder,
                &format!("2026-10-{:02}T10:00:00.000Z", day - 100),
            );
        }
    }
}

/// The full text landed lines give without needs-you or running items.
fn landed_text(lines: &[&str]) -> String {
    if lines.is_empty() {
        return String::from("Inbox empty.\n");
    }
    let mut text = String::from("Needs you\n  (none)\nRunning\n  (none)\nLanded since last look\n");
    for line in lines {
        text.push_str(line);
        text.push('\n');
    }
    text
}

/// The first ten landed lines of the twelve-change project.
fn first_ten() -> [&'static str; 10] {
    [
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
    ]
}

/// Runs `inbox` with `home` and returns its text.
fn inbox_text(root: &Path, home: &Path) -> String {
    InboxFeature::at(1_792_843_200_000)
        .with_home(home)
        .run(&Invocation::new(root, "inbox", Vec::new()))
        .expect("inbox succeeds")
        .text
}

/// Covers: rust-inbox/landed-after-the-cursor
#[test]
fn landed_after_the_cursor() {
    let cases: [(&str, &str, &[&str]); 5] = [
        (
            "last-look",
            "{\"lastLook\":\"2026-10-08T10:00:00.000Z\"}\n",
            &[
                "  110: J — archived 2026-10-10T10:00:00.000Z — osq show 110",
                "  111: K — archived 2026-10-10T10:00:00.000Z — osq show 111",
                "  109: I — archived 2026-10-09T10:00:00.000Z — osq show 109",
            ],
        ),
        (
            "old-look",
            "{\"lastLook\":\"2026-09-01T00:00:00.000Z\"}\n",
            &[
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
                "  101: A — archived 2026-10-01T10:00:00.000Z — osq show 101",
            ],
        ),
        (
            "future-look",
            "{\"lastLook\":\"2026-10-11T00:00:00.000Z\"}\n",
            &[],
        ),
        ("invalid-time", "{\"lastLook\":\"later\"}\n", &first_ten()),
        ("not-json", "not json", &first_ten()),
    ];
    for (name, cursor, lines) in cases {
        let base = scratch(&format!("landed_after_the_cursor_{name}"));
        let root = base.join("checkout");
        let home = base.join("home");
        fs::create_dir_all(&home).unwrap();
        landed_project(&root);
        write_cursor(&root, &home, cursor);
        assert_eq!(inbox_text(&root, &home), landed_text(lines), "{name}");
    }
}

/// Covers: rust-inbox/cursor-file-after-a-run
#[test]
fn cursor_file_after_a_run() {
    let base = scratch("cursor_file_after_a_run");
    let root = base.join("checkout");
    let home = base.join("home");
    fs::create_dir_all(&home).unwrap();
    assert_eq!(inbox_text(&root, &home), "Inbox empty.\n");
    assert_eq!(
        fs::read_to_string(cursor_path(&root, &home)).unwrap(),
        "{\"lastLook\":\"2026-10-24T12:00:00.000Z\"}\n"
    );

    let refused_home = base.join("refused-home");
    fs::create_dir_all(&refused_home).unwrap();
    let error = InboxFeature::at(1_792_843_200_000)
        .with_home(&refused_home)
        .run(&Invocation::new(
            &root,
            "inbox",
            vec![String::from("extra")],
        ))
        .expect_err("the argument is refused");
    assert!(matches!(error, FeatureError::Usage { .. }), "{error}");
    assert!(!cursor_path(&root, &refused_home).exists());

    let file_home = base.join("home-file");
    fs::write(&file_home, "not a folder").unwrap();
    let error = InboxFeature::at(1_792_843_200_000)
        .with_home(&file_home)
        .run(&Invocation::new(&root, "inbox", Vec::new()))
        .expect_err("the cursor cannot be written");
    assert!(matches!(error, FeatureError::Failed { .. }), "{error}");
}

/// Proves the cursor time is JavaScript's `toISOString()` form at date edges.
///
/// Covers: rust-inbox/cursor-file-after-a-run
#[test]
fn cursor_time_is_typescripts_iso_form() {
    let rows: [(i64, &str); 16] = [
        (-62_162_121_600_000, "0000-02-29T00:00:00.000Z"),
        (-62_162_035_200_001, "0000-02-29T23:59:59.999Z"),
        (-62_162_035_200_000, "0000-03-01T00:00:00.000Z"),
        (-62_135_596_800_000, "0001-01-01T00:00:00.000Z"),
        (-59_006_316_303_211, "0100-03-01T12:34:56.789Z"),
        (-49_539_254_400_001, "0400-02-29T23:59:59.999Z"),
        (-11_670_998_400_000, "1600-02-29T00:00:00.000Z"),
        (-1, "1969-12-31T23:59:59.999Z"),
        (0, "1970-01-01T00:00:00.000Z"),
        (951_804_428_009, "2000-02-29T06:07:08.009Z"),
        (1_709_208_000_000, "2024-02-29T12:00:00.000Z"),
        (1_735_689_599_999, "2024-12-31T23:59:59.999Z"),
        (1_735_689_600_000, "2025-01-01T00:00:00.000Z"),
        (1_792_231_200_000, "2026-10-17T10:00:00.000Z"),
        (13_574_563_200_000, "2400-02-29T00:00:00.000Z"),
        (253_402_300_799_999, "9999-12-31T23:59:59.999Z"),
    ];
    for (index, (ms, expected)) in rows.into_iter().enumerate() {
        let base = scratch(&format!("cursor_time_is_typescripts_iso_form_{index}"));
        let root = base.join("checkout");
        let home = base.join("home");
        fs::create_dir_all(&home).unwrap();
        let output = InboxFeature::at(ms)
            .with_home(&home)
            .run(&Invocation::new(&root, "inbox", Vec::new()))
            .expect("inbox succeeds")
            .text;
        assert_eq!(output, "Inbox empty.\n", "{ms}");
        assert_eq!(
            fs::read_to_string(cursor_path(&root, &home)).unwrap(),
            format!("{{\"lastLook\":\"{expected}\"}}\n"),
            "{ms}"
        );
    }
}

/// Copies `from` into `to`, including every file and folder.
fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap().flatten() {
        let path = entry.path();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&path, &target);
        } else {
            fs::copy(&path, &target).unwrap();
        }
    }
}

/// Covers: rust-inbox/inbox-cursor-equals-typescript-s
#[test]
fn inbox_cursor_equals_typescripts() {
    let base = scratch("inbox_cursor_equals_typescripts");
    let root = base.join("checkout");
    let home = base.join("home");
    fs::create_dir_all(&home).unwrap();
    copy_dir(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/repo"),
        &root,
    );
    write_cursor(
        &root,
        &home,
        "{\"lastLook\":\"2026-10-01T10:00:00.000Z\"}\n",
    );
    let expected = include_str!("fixtures/json-golden/repo-cursor.txt");
    assert_eq!(inbox_text(&root, &home), expected);
}
