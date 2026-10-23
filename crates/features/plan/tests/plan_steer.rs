//! Proves `plan <id>` refuses, warns and hands off a steered change as
//! TypeScript does.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_plan::PlanFeature;

/// The fixture project the steering tests copy.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/steer-project")
}

/// The golden folder the steering tests compare against.
fn goldens() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/steer-golden")
}

/// Creates a scratch root for one row, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Copies a folder tree, dot folders and files included.
fn copy_tree(from: &Path, to: &Path) {
    for entry in fs::read_dir(from).expect("the fixture folder is read") {
        let entry = entry.expect("the fixture entry is read");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type is read").is_dir() {
            fs::create_dir_all(&target).expect("the target folder is created");
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the fixture file is copied");
        }
    }
}

/// A fresh copy of the steering fixture under `CARGO_TARGET_TMPDIR`.
fn fixture_copy(name: &str) -> PathBuf {
    let root = scratch(name);
    copy_tree(&fixture(), &root);
    root
}

/// Every file under one root with its bytes, keyed by its relative path.
fn tree(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    collect(root, root, &mut files);
    files
}

/// Appends every file under `folder` to `files`.
fn collect(base: &Path, folder: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
    for entry in fs::read_dir(folder).expect("a folder is read") {
        let entry = entry.expect("an entry is read");
        let path = entry.path();
        if entry.file_type().expect("the entry type is read").is_dir() {
            collect(base, &path, files);
        } else {
            let relative = path.strip_prefix(base).expect("the path is under the root");
            files.insert(
                relative.to_path_buf(),
                fs::read(&path).expect("the file is read"),
            );
        }
    }
}

/// Runs `plan` with the given arguments.
fn run_plan(root: &Path, args: &[&str]) -> Result<Output, FeatureError> {
    PlanFeature::new().run(&Invocation::new(
        root,
        "plan",
        args.iter().map(|arg| (*arg).to_owned()).collect(),
    ))
}

/// Replaces the scratch root with `<root>` in a text.
fn normalise(text: &str, root: &Path) -> String {
    text.replace(&root.display().to_string(), "<root>")
}

/// Reads one golden file.
fn golden(name: &str) -> String {
    fs::read_to_string(goldens().join(name)).expect("the golden reads")
}

/// Proves every row of "Nothing to steer".
///
/// Covers: rust-plan/nothing-to-steer
#[test]
fn nothing_to_steer() {
    let rows: [(&str, &str, &str); 3] = [
        (
            "8",
            "008",
            "No active change matching \"8\" needs steering; Rust osq plan 8 steers a change only.",
        ),
        (
            "009-unapproved",
            "009-unapproved",
            "No active change matching \"009-unapproved\" needs steering; Rust osq plan 009-unapproved steers a change only.",
        ),
        (
            "99",
            "99",
            "No active change matching \"99\" needs steering; Rust osq plan 99 steers a change only.",
        ),
    ];
    for (id, name, expected) in rows {
        let root = fixture_copy(&format!("nothing_to_steer/{name}"));
        let before = tree(&root);
        match run_plan(&root, &[id]) {
            Err(FeatureError::Failed {
                command, message, ..
            }) => assert_eq!(
                (command.as_str(), message.as_str()),
                ("plan", expected),
                "row {id}"
            ),
            other => panic!("row {id} expects a Failed error, got {other:?}"),
        }
        assert_eq!(tree(&root), before, "row {id} writes nothing");
    }
}

/// Proves every row of "Steering equals TypeScript's".
///
/// Covers: rust-plan/steering-equals-typescript-s
#[test]
fn steering_equals_typescripts() {
    let rows: [(&str, &str, &str); 8] = [
        ("1", "blocked-001", "001-blocked"),
        ("002", "stuck-002", "002-stuck"),
        ("003-regression", "regression-003", "003-regression"),
        ("4", "conflict-004", "004-conflict"),
        ("5", "requirement-005", "005-requirement"),
        ("6", "sync-red-006", "006-sync-red"),
        ("7", "many-007", "007-many"),
        ("10", "untitled-010", "010-untitled"),
    ];
    for (id, name, folder) in rows {
        let root = fixture_copy(&format!("steering_equals_typescripts/{name}"));
        let before = tree(&root);
        let output = run_plan(&root, &[id])
            .unwrap_or_else(|error| panic!("row {name} fails: {error}"))
            .text;
        assert_eq!(
            normalise(&output, &root),
            golden(&format!("{name}.out.txt")),
            "row {name} output"
        );
        let prompt_path = root
            .join("openspec")
            .join("changes")
            .join(folder)
            .join("plan-prompt.md");
        let prompt = fs::read_to_string(&prompt_path).expect("the prompt reads");
        assert_eq!(
            normalise(&prompt, &root),
            golden(&format!("{name}.prompt.txt")),
            "row {name} prompt"
        );
        let mut after = tree(&root);
        after.remove(
            prompt_path
                .strip_prefix(&root)
                .expect("the prompt is under the root"),
        );
        assert_eq!(after, before, "row {name} writes no other file");
    }
}

/// Proves "Steering handoff with the slash command".
///
/// Covers: rust-plan/steering-handoff-with-the-slash-command
#[test]
fn steering_handoff_with_the_slash_command() {
    let root = fixture_copy("steering_handoff_with_the_slash_command");
    let command = root.join(".claude").join("commands").join("osq-plan.md");
    fs::create_dir_all(command.parent().expect("the command has a parent"))
        .expect("the command folder is created");
    fs::write(&command, "").expect("the command file is written");
    let output = run_plan(&root, &["1"]).expect("the plan succeeds").text;
    assert_eq!(
        normalise(&output, &root),
        format!(
            "{}\nIn Claude Code, /osq-plan 001 does the same.\n",
            golden("blocked-001.out.txt")
        )
    );
}
