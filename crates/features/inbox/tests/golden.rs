//! Proves that the printed inbox equals TypeScript's golden text.

use std::path::Path;

use osq_core::{Feature, Invocation};
use osq_feature_inbox::InboxFeature;

/// The golden fixture repository.
fn repository() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/repo")
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
    let invocation = Invocation::new(repository(), "inbox", Vec::new());
    let actual = InboxFeature::new()
        .run(&invocation)
        .expect("inbox succeeds")
        .text;
    let expected = include_str!("golden/inbox.txt");
    assert_eq!(actual, expected, "{}", first_difference(&actual, expected));
}
