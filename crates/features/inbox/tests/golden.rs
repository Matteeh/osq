//! Proves that the printed inbox equals TypeScript's golden text.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_inbox::InboxFeature;

/// The golden fixture repository.
fn repository() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/repo")
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

/// The first line that differs, with both values.
fn first_difference(actual: &str, expected: &str) -> String {
    let actual_lines: Vec<&str> = actual.lines().collect();
    let expected_lines: Vec<&str> = expected.lines().collect();
    for (index, (left, right)) in actual_lines.iter().zip(&expected_lines).enumerate() {
        if left != right {
            return format!(
                "line {} differs:\n  actual:   {left}\n  expected: {right}",
                index + 1
            );
        }
    }
    format!(
        "line counts differ: actual {} lines, expected {} lines",
        actual_lines.len(),
        expected_lines.len()
    )
}

/// Covers: rust-inbox/golden-inbox-matches-typescript
#[test]
fn golden_inbox_matches_typescript() {
    let root = repository();
    let invocation = Invocation::new(&root, "inbox", Vec::new());
    let actual = InboxFeature::new()
        .with_home(home_for(&root))
        .run(&invocation)
        .expect("inbox succeeds")
        .text;
    let expected = include_str!("golden/inbox.txt");
    assert_eq!(actual, expected, "{}", first_difference(&actual, expected));
}
