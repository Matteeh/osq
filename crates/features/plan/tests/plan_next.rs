//! Proves the `plan --next` arguments, refusals and chosen items.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_plan::PlanFeature;

/// The one queue text the refused and chosen rows share.
const QUEUE: &str = "## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: a\n\nB.\n";

/// Creates a scratch root for one row, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes one file under a base folder, creating its parent folders.
fn write(base: &Path, relative: &str, text: &str) {
    let path = base.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's parent is created");
    }
    fs::write(path, text).expect("the file is written");
}

/// Writes the repository's `openspec/queue.md`.
fn write_queue(root: &Path, text: &str) {
    write(root, "openspec/queue.md", text);
}

/// Writes a brief naming one queue item.
fn write_brief(folder: &Path, item: &str) {
    write(
        folder,
        "brief.md",
        &format!("---\nqueue_item: {item}\n---\n\nA brief.\n"),
    );
}

/// Creates an active change folder with a brief, proposal and first task.
fn active(root: &Path, name: &str, item: &str) -> PathBuf {
    let folder = root.join("openspec").join("changes").join(name);
    fs::create_dir_all(&folder).expect("the change folder is created");
    write_brief(&folder, item);
    write(
        &folder,
        "proposal.md",
        "---\ntitle: P\n---\n\n## Goal\n\nA goal.\n",
    );
    write(&folder, "tasks/1.md", "---\ntitle: T\n---\n");
    folder
}

/// Creates a folder in one location with only a brief.
fn folder(root: &Path, name: &str, item: &str) -> PathBuf {
    let folder = root.join("openspec").join("changes").join(name);
    fs::create_dir_all(&folder).expect("the change folder is created");
    write_brief(&folder, item);
    folder
}

/// The direct entry names under the changes folder, sorted.
fn entries(root: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(root.join("openspec").join("changes")) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// Runs `plan` with the given arguments.
fn run_plan(root: &Path, args: &[&str]) -> Result<Output, FeatureError> {
    PlanFeature::new().run(&Invocation::new(
        root,
        "plan",
        args.iter().map(|arg| (*arg).to_owned()).collect(),
    ))
}

/// Proves every row of "Plan argument errors".
///
/// Covers: rust-plan/plan-argument-errors
#[test]
fn plan_argument_errors() {
    let cases: [(&str, &[&str]); 6] = [
        ("no args", &[]),
        ("replan alone", &["--replan"]),
        ("next twice", &["--next", "--next"]),
        ("replan twice", &["--next", "--replan", "--replan"]),
        ("next without dashes", &["next"]),
        ("unknown after next", &["--next", "x"]),
    ];
    for (name, args) in cases {
        let root = scratch(&format!("plan_argument_errors/{}", name.replace(' ', "_")));
        match run_plan(&root, args) {
            Err(FeatureError::Usage {
                command, message, ..
            }) => {
                assert_eq!(
                    (command.as_str(), message.as_str()),
                    ("plan", "expected --next [--replan]"),
                    "row {name}"
                );
            }
            other => panic!("row {name} expects a Usage error, got {other:?}"),
        }
    }
}

/// Builds no folders.
fn none(_root: &Path) {}

/// Builds one active change with a regressed change marker.
fn regressed_change(root: &Path) {
    let folder = active(root, "003-a", "a");
    write(&folder, ".run/regressed/change.md", "---\n---\n");
}

/// Builds two active changes with task failures in a mixed order.
fn mixed_failures(root: &Path) {
    let folder = active(root, "010-a", "a");
    write(&folder, "tasks/2.md", "---\ntitle: T2\n---\n");
    write(&folder, ".run/regressed/1.md", "---\n---\n");
    write(&folder, ".run/dead/2.md", "---\nreason: verify_red\n---\n");
    let old = active(root, "9-old", "old");
    write(&old, ".run/dead/1.md", "---\n---\n");
}

/// Builds two archived changes naming one item.
fn archived_ambiguity(root: &Path) {
    let _ = folder(root, "archive/001-a", "a");
    let _ = folder(root, "archive/002-a", "a");
}

/// Builds one unapproved active change.
fn unapproved(root: &Path) {
    let _ = active(root, "001-a", "a");
}

/// Builds one rejected change.
fn rejected(root: &Path) {
    let _ = folder(root, "rejected/001-a", "a");
}

/// Proves every row of "Refused next items".
///
/// Covers: rust-plan/refused-next-items
#[test]
fn refused_next_items() {
    type Setup = fn(&Path);
    let rows: [(&str, Option<&str>, Setup, &str); 8] = [
        ("no queue file", None, none, "Queue file not found: {queue}"),
        (
            "regressed change",
            None,
            regressed_change,
            "Queue planning is blocked by active failures:\n  - 003 change (regressed): osq retry 003 change",
        ),
        (
            "mixed failures",
            None,
            mixed_failures,
            "Queue planning is blocked by active failures:\n  - 9 1 (dead): osq retry 9 1\n  - 010 1 (regressed): osq retry 010 1\n  - 010 2 (verify_red): osq retry 010 2",
        ),
        (
            "malformed heading",
            Some("## [a]\n"),
            none,
            "{queue}: malformed queue item heading \"## [a]\"",
        ),
        (
            "archived ambiguity",
            Some(QUEUE),
            archived_ambiguity,
            "Ambiguous queue association for \"a\": multiple archived changes (001-a, 002-a)",
        ),
        (
            "unapproved first item",
            Some(QUEUE),
            unapproved,
            "No queue item is eligible to plan.\n  - a: planned\n  - b: unplanned (waiting on a)",
        ),
        (
            "empty queue",
            Some("# Queue\n"),
            none,
            "No queue item is eligible to plan.\n",
        ),
        (
            "rejected first item",
            Some(QUEUE),
            rejected,
            "Queue item \"a\" has 1 rejected attempt(s) and no active plan. Re-run with --replan to create a new attempt.",
        ),
    ];
    for (name, queue, setup, expected) in rows {
        let root = scratch(&format!("refused_next_items/{}", name.replace(' ', "_")));
        if let Some(text) = queue {
            write_queue(&root, text);
        }
        setup(&root);
        let before = entries(&root);
        let queue_path = root.join("openspec").join("queue.md");
        let expected = expected.replace("{queue}", &queue_path.display().to_string());
        match run_plan(&root, &["--next"]) {
            Err(FeatureError::Failed {
                command, message, ..
            }) => {
                assert_eq!(
                    (command.as_str(), message.as_str()),
                    ("plan", expected.as_str()),
                    "row {name}"
                );
            }
            other => panic!("row {name} expects a Failed error, got {other:?}"),
        }
        assert_eq!(entries(&root), before, "row {name} writes no change folder");
    }
}

/// Proves the failure order, precedence and empty-reason fallback.
///
/// Covers: rust-plan/refused-next-items
#[test]
fn failure_order() {
    let root = scratch("failure_order");
    let first = active(&root, "010-a", "a");
    write(&first, "tasks/2.md", "---\ntitle: T2\n---\n");
    write(&first, "tasks/3.md", "---\ntitle: T3\n---\n");
    write(&first, ".run/regressed/change.md", "---\n---\n");
    write(&first, ".run/regressed/1.md", "---\n---\n");
    write(&first, ".run/dead/1.md", "---\nreason: ignored\n---\n");
    write(&first, ".run/dead/2.md", "---\nreason: ignored\n---\n");
    write(&first, ".run/done/2", "");
    write(&first, ".run/dead/3.md", "---\n---\n");
    let old = active(&root, "9-old", "old");
    write(&old, ".run/dead/1.md", "---\nreason: x\n---\n");
    let spec = folder(&root, "020-spec", "spec");
    write(&spec, "spec.md", "# Spec\n");
    write(&spec, "tasks/1.md", "---\ntitle: T\n---\n");
    write(&spec, ".run/dead/1.md", "---\nreason: spec_fail\n---\n");
    let plus = active(&root, "+5", "plus");
    write(&plus, ".run/dead/1.md", "---\nreason: z\n---\n");
    let empty = active(&root, "030-empty", "");
    write(&empty, "brief.md", "---\nqueue_item: \"\"\n---\n\nA.\n");
    write(&empty, ".run/dead/1.md", "---\nreason: empty_fail\n---\n");
    let text = active(&root, "abc", "other");
    write(&text, ".run/dead/1.md", "---\nreason: y\n---\n");
    let expected = "Queue planning is blocked by active failures:\n  - 9 1 (x): osq retry 9 1\n  - 010 1 (regressed): osq retry 010 1\n  - 010 3 (dead): osq retry 010 3\n  - 010 change (regressed): osq retry 010 change\n  - 020 1 (spec_fail): osq retry 020 1\n  - +5 1 (z): osq retry +5 1\n  - abc 1 (y): osq retry abc 1";
    match run_plan(&root, &["--next"]) {
        Err(FeatureError::Failed {
            command, message, ..
        }) => assert_eq!(
            (command.as_str(), message.as_str()),
            ("plan", expected),
            "row failure order"
        ),
        other => panic!("row failure order expects a Failed error, got {other:?}"),
    }
}

/// Builds no folders before a chosen item.
fn chosen_none(_root: &Path) {}

/// Builds the landed item's archived folder.
fn chosen_archived(root: &Path) {
    let _ = folder(root, "archive/001-a", "a");
}

/// Builds one rejected change numbered 001.
fn chosen_rejected_001(root: &Path) {
    let _ = folder(root, "rejected/001-a", "a");
}

/// Builds one rejected change numbered 003.
fn chosen_rejected_003(root: &Path) {
    let _ = folder(root, "rejected/003-a", "a");
}

/// Proves every row of "Chosen next items".
///
/// Covers: rust-plan/chosen-next-items
#[test]
fn chosen_next_items() {
    type Setup = fn(&Path);
    let rows: [(&str, &[&str], Setup, &str, &str); 4] = [
        ("plain", &["--next"], chosen_none, "001-a", "a"),
        ("after archive", &["--next"], chosen_archived, "002-b", "b"),
        (
            "replan after rejection",
            &["--next", "--replan"],
            chosen_rejected_001,
            "002-a",
            "a",
        ),
        (
            "replan before next",
            &["--replan", "--next"],
            chosen_rejected_003,
            "004-a",
            "a",
        ),
    ];
    for (name, args, setup, expected_folder, expected_item) in rows {
        let root = scratch(&format!("chosen_next_items/{}", name.replace(' ', "_")));
        write_queue(&root, QUEUE);
        setup(&root);
        let output = run_plan(&root, args).unwrap_or_else(|error| panic!("row {name}: {error}"));
        assert!(!output.text.is_empty(), "row {name} gives output");
        let folder = root.join("openspec").join("changes").join(expected_folder);
        assert!(folder.is_dir(), "row {name} creates {expected_folder}");
        let brief = fs::read_to_string(folder.join("brief.md")).expect("the brief reads");
        assert_eq!(
            osq_kernel_storage::frontmatter_string(&brief, "queue_item").as_deref(),
            Some(expected_item),
            "row {name} queue_item"
        );
    }
}
