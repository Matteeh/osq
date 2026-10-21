//! Corpus test: this repository's archived prompt sections.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// The fixed time whose UTC date the brief records.
const TIME: i64 = 1_792_584_000_000;

/// The one-item queue the scratch root holds.
const QUEUE: &str = "## [next] Next\n\nDepends on: nothing\n\nNext.\n";

/// The exclusive upper bound on the archived changes the scratch root links.
const LAST_NUMBER: u128 = 251;

/// The exclusive upper bound on the manual records the scratch root links.
const LAST_KEPT_AT: &str = "2026-10-21T16:00:00.000Z";

/// The marker before the record and the sections after it.
const MARKER: &str = "\n\n## This repository's record";

/// The repository root, three folders above this crate.
fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .expect("the repository root exists")
}

/// Creates a fresh scratch root for the corpus run.
fn scratch() -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("prompt_sections_corpus");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes one file, creating its parent folders.
fn write(path: &Path, text: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's parent is created");
    }
    fs::write(path, text).expect("the file is written");
}

/// Links one file, falling back to a copy when linking fails.
fn link(from: &Path, to: &Path) {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).expect("the target's parent is created");
    }
    if fs::hard_link(from, to).is_err() {
        fs::copy(from, to).expect("the file is copied");
    }
}

/// Links every file under a folder into a target folder.
fn link_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the target folder is created");
    for entry in fs::read_dir(from).expect("the source folder reads") {
        let entry = entry.expect("the folder entry reads");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type reads").is_dir() {
            link_tree(&entry.path(), &target);
        } else {
            link(&entry.path(), &target);
        }
    }
}

/// The digits a name leads with, or none when it leads with no digit.
fn leading_number(name: &str) -> Option<u128> {
    name.chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>()
        .parse()
        .ok()
}

/// Links the archived change folders up to the last number.
fn link_archives(source: &Path, root: &Path) {
    let archive = source.join("openspec/changes/archive");
    let target = root.join("openspec/changes/archive");
    for entry in fs::read_dir(&archive).expect("the archive folder reads") {
        let entry = entry.expect("the archive entry reads");
        let name = entry.file_name().to_string_lossy().into_owned();
        if !entry.file_type().expect("the entry type reads").is_dir() {
            continue;
        }
        if leading_number(&name).is_some_and(|number| number <= LAST_NUMBER) {
            link_tree(&entry.path(), &target.join(name));
        }
    }
}

/// Links the manual records kept before the cutoff.
fn link_manual(source: &Path, root: &Path) {
    let target = root.join("openspec/manual");
    for record in osq_kernel_storage::read_manual_edits(source) {
        if record.kept_at.as_str() < LAST_KEPT_AT {
            link(
                &source.join("openspec/manual").join(&record.file),
                &target.join(&record.file),
            );
        }
    }
}

/// The new change folder's `plan-prompt.md`.
fn new_prompt(root: &Path) -> String {
    let changes = root.join("openspec").join("changes");
    let folder = fs::read_dir(&changes)
        .expect("the changes folder reads")
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.is_dir()
                && path
                    .file_name()
                    .is_some_and(|name| name != "archive" && name != "rejected")
        })
        .expect("the new change folder exists");
    fs::read_to_string(folder.join("plan-prompt.md")).expect("the prompt reads")
}

/// Fails with the first line that differs.
fn assert_same(actual: &str, expected: &str) {
    if actual == expected {
        return;
    }
    for (index, (left, right)) in actual.lines().zip(expected.lines()).enumerate() {
        assert_eq!(left, right, "first differing line {}", index + 1);
    }
    panic!(
        "the texts have different lengths: actual {} bytes, expected {} bytes",
        actual.len(),
        expected.len()
    );
}

/// Proves "Golden archive sections" over the live archive up to change 251.
///
/// Covers: rust-plan/golden-archive-sections
#[test]
#[ignore = "corpus test: reads the live archive"]
fn golden_archive_sections() {
    let source = repository_root();
    let root = scratch();
    link_archives(&source, &root);
    link_manual(&source, &root);
    write(&root.join("openspec/queue.md"), QUEUE);
    PlanFeature::at(TIME)
        .run(&Invocation::new(&root, "plan", vec!["--next".to_owned()]))
        .expect("this repository's next item plans");
    let prompt = new_prompt(&root);
    let start = prompt.find(MARKER).expect("the record section exists") + 2;
    let expected = fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/sections/archive.md"),
    )
    .expect("the golden sections read");
    assert_same(&prompt[start..], &expected);
}
