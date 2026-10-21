//! Proves queue parsing, refusals and the text of unplanned items.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_plan::PlanFeature;

/// Creates a scratch root for one test, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes the repository's `openspec/queue.md`.
fn write_queue(root: &Path, text: &str) {
    let folder = root.join("openspec");
    fs::create_dir_all(&folder).expect("the openspec folder is created");
    fs::write(folder.join("queue.md"), text).expect("the queue file is written");
}

/// Runs the feature's `queue` command.
fn run_queue(root: &Path) -> Result<Output, FeatureError> {
    PlanFeature::new().run(&Invocation::new(root, "queue", Vec::new()))
}

/// Proves every row of "Items of a queue".
///
/// Covers: rust-plan/items-of-a-queue
#[test]
fn items_of_a_queue() {
    let root = scratch("items_of_a_queue");
    let cases = [
        (
            "no items",
            "# Queue\n\nNothing yet.\n",
            "Queue:\n  (no items)",
        ),
        (
            "two items with carriage returns",
            "# Queue\n\nPeople text.\n\n## [a] First item  \r\n\r\nDepends on: nothing\r\n\r\nA brief.\r\n\r\n### [x] Not an item\r\n\r\n##\t[b-2]\tSecond item\n\nDepends on: a\nFixes: a\n\nB brief.\n",
            "Queue:\n  a: First item [unplanned] rejections: 0\n  b-2: Second item [unplanned] rejections: 0 unmet: a, a",
        ),
        (
            "one item with no preamble",
            "## [a] First item\n\nDepends on: nothing\n\nA brief.\n",
            "Queue:\n  a: First item [unplanned] rejections: 0",
        ),
    ];
    for (name, queue, expected) in cases {
        write_queue(&root, queue);
        assert_eq!(
            run_queue(&root).expect("the queue reads").text,
            expected,
            "row {name}"
        );
    }
}

/// The refused queue rows: a label, the queue text (if any) and the detail.
const REFUSED_QUEUES: [(&str, Option<&str>, Option<&str>); 32] = [
    ("no file", None, None),
    (
        "malformed heading without a title",
        Some("## [a]\n\nDepends on: nothing\n\nA.\n"),
        Some("malformed queue item heading \"## [a]\""),
    ),
    (
        "heading without a space after the hashes",
        Some("##[a] A\n\nDepends on: nothing\n\nA.\n"),
        Some("malformed queue item heading \"##[a] A\""),
    ),
    (
        "heading with an empty title",
        Some("## [a]   \n\nDepends on: nothing\n\nA.\n"),
        Some("malformed queue item heading \"## [a]\""),
    ),
    (
        "heading with a whitespace title",
        Some("## [a] \u{a0}A\n\nDepends on: nothing\n\nA.\n"),
        Some("malformed queue item heading \"## [a] \u{a0}A\""),
    ),
    (
        "slug with a space",
        Some("## [a b] A\n\nDepends on: nothing\n\nA.\n"),
        Some("invalid queue item slug \"a b\""),
    ),
    (
        "slug with an underscore",
        Some("## [Bad_Slug] A\n\nDepends on: nothing\n\nA.\n"),
        Some("invalid queue item slug \"Bad_Slug\""),
    ),
    (
        "duplicate slug",
        Some("## [a] A\n\nDepends on: nothing\n\nA.\n\n## [a] A\n\nDepends on: nothing\n\nA.\n"),
        Some("duplicate queue item slug \"a\""),
    ),
    (
        "missing dependency line",
        Some("## [a] A\n\n"),
        Some("queue item \"a\" is missing its Depends on: line"),
    ),
    (
        "malformed dependency line",
        Some("## [a] A\n\nNeeds: nothing\n\nA.\n"),
        Some("queue item \"a\" has a malformed dependency line"),
    ),
    (
        "empty dependency line",
        Some("## [a] A\n\nDepends on:\n\nA.\n"),
        Some("queue item \"a\" has an empty dependency line"),
    ),
    (
        "invalid dependency",
        Some("## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: A\n\nB.\n"),
        Some("queue item \"b\" has an invalid dependency \"A\""),
    ),
    (
        "repeated dependency",
        Some("## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: a, a\n\nB.\n"),
        Some("queue item \"b\" repeats dependency \"a\""),
    ),
    (
        "later dependency",
        Some("## [a] A\n\nDepends on: b\n\nA.\n\n## [b] B\n\nDepends on: nothing\n\nB.\n"),
        Some("queue item \"a\" dependency \"b\" must reference an earlier item"),
    ),
    (
        "self dependency",
        Some("## [a] A\n\nDepends on: a\n\nA.\n"),
        Some("queue item \"a\" dependency \"a\" must reference an earlier item"),
    ),
    (
        "empty fixes line",
        Some(
            "## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\nFixes:\n\nB.\n",
        ),
        Some("queue item \"b\" has an empty fixes line"),
    ),
    (
        "invalid fix",
        Some(
            "## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\nFixes: A\n\nB.\n",
        ),
        Some("queue item \"b\" has an invalid fix \"A\""),
    ),
    (
        "later fix",
        Some(
            "## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\nFixes: c\n\nB.\n",
        ),
        Some("queue item \"b\" fix \"c\" must reference an earlier item"),
    ),
    (
        "repeated fix",
        Some(
            "## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\nFixes: a, a\n\nB.\n",
        ),
        Some("queue item \"b\" repeats fix \"a\""),
    ),
    (
        "self fix",
        Some("## [a] A\n\nDepends on: nothing\nFixes: a\n\nA.\n"),
        Some("queue item \"a\" fix \"a\" must reference an earlier item"),
    ),
    (
        "empty brief body",
        Some("## [a] A\n\nDepends on: nothing\n\n"),
        Some("queue item \"a\" has an empty brief body"),
    ),
    (
        "second dependency line",
        Some("## [a] A\n\nDepends on: nothing\n\nA.\nDepends on: nothing\n"),
        Some("queue item \"a\" has more than one Depends on: line"),
    ),
    (
        "second fixes line",
        Some(
            "## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\nFixes: a\n\nB.\nFixes: a\n",
        ),
        Some("queue item \"b\" has more than one Fixes: line"),
    ),
    (
        "tab and quote in the slug",
        Some("## [a\t\"b] A\n\nDepends on: nothing\n\nA.\n"),
        Some("invalid queue item slug \"a\\t\\\"b\""),
    ),
    (
        "carriage return in the title",
        Some("## [a] A\rB\n\nDepends on: nothing\n\nA.\n"),
        Some("malformed queue item heading \"## [a] A\\rB\""),
    ),
    (
        "leading hyphen",
        Some("## [-a] A\n\nDepends on: nothing\n\nA.\n"),
        Some("invalid queue item slug \"-a\""),
    ),
    (
        "trailing hyphen",
        Some("## [a-] A\n\nDepends on: nothing\n\nA.\n"),
        Some("invalid queue item slug \"a-\""),
    ),
    (
        "double hyphen",
        Some("## [a--b] A\n\nDepends on: nothing\n\nA.\n"),
        Some("invalid queue item slug \"a--b\""),
    ),
    (
        "backslash in the slug",
        Some("## [a\\b] A\n\nDepends on: nothing\n\nA.\n"),
        Some("invalid queue item slug \"a\\\\b\""),
    ),
    (
        "backspace in the slug",
        Some("## [a\u{8}b] A\n\nDepends on: nothing\n\nA.\n"),
        Some("invalid queue item slug \"a\\bb\""),
    ),
    (
        "form feed in the slug",
        Some("## [a\u{c}b] A\n\nDepends on: nothing\n\nA.\n"),
        Some("invalid queue item slug \"a\\fb\""),
    ),
    (
        "control character in the slug",
        Some("## [a\u{1}b] A\n\nDepends on: nothing\n\nA.\n"),
        Some("invalid queue item slug \"a\\u0001b\""),
    ),
];

/// Proves every row of "Refused queues".
///
/// Covers: rust-plan/refused-queues
#[test]
fn refused_queues() {
    let root = scratch("refused_queues");
    let path = root.join("openspec").join("queue.md");
    for (name, queue, detail) in REFUSED_QUEUES {
        if let Some(text) = queue {
            write_queue(&root, text);
        } else {
            let _ = fs::remove_file(&path);
        }
        let expected = match detail {
            Some(detail) => format!("{}: {detail}", path.display()),
            None => format!("Queue file not found: {}", path.display()),
        };
        match run_queue(&root) {
            Err(FeatureError::Failed {
                command, message, ..
            }) => assert_eq!(
                (command.as_str(), message.as_str()),
                ("queue", expected.as_str()),
                "row {name}"
            ),
            other => panic!("row {name} expects a Failed error, got {other:?}"),
        }
    }
}

/// Proves the text of "Lines of unplanned items".
///
/// Covers: rust-plan/lines-of-unplanned-items
#[test]
fn lines_of_unplanned_items() {
    let root = scratch("lines_of_unplanned_items");
    write_queue(
        &root,
        "## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: a\nFixes: a\n\nB.\n\n## [c] C\n\nDepends on: b, a\n\nC.\n",
    );
    let expected = [
        "Queue:",
        "  a: A [unplanned] rejections: 0",
        "  b: B [unplanned] rejections: 0 unmet: a, a",
        "  c: C [unplanned] rejections: 0 unmet: b, a",
    ]
    .join("\n");
    assert_eq!(
        run_queue(&root).expect("the queue reads").text,
        expected,
        "lines of unplanned items"
    );
}
