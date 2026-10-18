//! Proves the pure text leaves read Markdown and timestamps the way TypeScript does.

use osq_kernel_storage::{frontmatter_string, goal_section, markdown_body, timestamp_ms};

/// Proves `frontmatter_string` and `markdown_body` on the scenario's rows.
///
/// Covers: rust-storage/frontmatter-and-body
#[test]
fn frontmatter_and_body() {
    let rows: [(&str, Option<&str>, &str); 6] = [
        (
            "---\ntitle: \"  Alpha  \"\n---\nbody",
            Some("  Alpha  "),
            "body",
        ),
        ("---\ntitle: 12\n---\nbody", None, "body"),
        ("---\ntitle: yes\n---\n", Some("yes"), ""),
        ("---\r\ntitle: x\r\n---\r\nrest", Some("x"), "rest"),
        ("no frontmatter", None, "no frontmatter"),
        (
            "---\ntitle: [unclosed\n---\nbody",
            None,
            "---\ntitle: [unclosed\n---\nbody",
        ),
    ];
    for (text, title, body) in rows {
        assert_eq!(
            frontmatter_string(text, "title").as_deref(),
            title,
            "title of {text:?}"
        );
        assert_eq!(markdown_body(text), body, "body of {text:?}");
    }
}

/// Checks the frontmatter edges the mutation check would otherwise miss.
///
/// Covers: rust-storage/frontmatter-and-body
#[test]
fn frontmatter_edges() {
    let rows: [(&str, Option<&str>, &str); 4] = [
        ("---\ntitle: x\n", None, "---\ntitle: x\n"),
        ("---\n---\nbody", None, "---\n---\nbody"),
        ("---\ntitle: x\n---", Some("x"), ""),
        ("---\r\ntitle: x\r\n---\r\n", Some("x"), ""),
    ];
    for (text, title, body) in rows {
        assert_eq!(
            frontmatter_string(text, "title").as_deref(),
            title,
            "title of {text:?}"
        );
        assert_eq!(markdown_body(text), body, "body of {text:?}");
    }
}

/// Proves `goal_section` on the scenario's rows.
///
/// Covers: rust-storage/goal-section
#[test]
fn goal_section_rows() {
    let rows: [(&str, Option<&str>); 7] = [
        ("## Goal\n\nShip it.\n\n## Verify\nx", Some("Ship it.")),
        ("## goal  \nLower case.", Some("Lower case.")),
        ("## Goal\n### Sub\ntext\n## Next", Some("### Sub\ntext")),
        ("## Goal\nA\n##Tight\nB\n## Next", Some("A\n##Tight\nB")),
        ("Intro\n### Goal\nDeep.\n## Next", Some("Deep.")),
        ("## Goal\n## Verify\nx", Some("## Verify\nx")),
        ("## Goals\nNot it.\n", None),
    ];
    for (body, goal) in rows {
        assert_eq!(goal_section(body).as_deref(), goal, "goal of {body:?}");
    }
}

/// Checks the Goal edges the mutation check would otherwise miss.
///
/// Covers: rust-storage/goal-section
#[test]
fn goal_section_edges() {
    let rows: [(&str, Option<&str>); 3] = [
        ("##Tight\n## Goal\nX", Some("X")),
        ("##   Goal   \nX", Some("X")),
        ("# Goal\nX", None),
    ];
    for (body, goal) in rows {
        assert_eq!(goal_section(body).as_deref(), goal, "goal of {body:?}");
    }
}

/// Proves `timestamp_ms` on the scenario's rows.
///
/// Covers: rust-storage/timestamps
#[test]
fn timestamps() {
    let rows: [(&str, Option<i64>); 6] = [
        ("2026-10-01T10:30:00.500Z", Some(1_790_850_600_500)),
        ("1970-01-01T00:00:00.000Z", Some(0)),
        ("2024-02-29T23:59:59.999Z", Some(1_709_251_199_999)),
        ("2026-10-01 10:30:00Z", None),
        ("2026-13-01T00:00:00.000Z", None),
        ("2026-10-01T10:30:00Z", None),
    ];
    for (text, expected) in rows {
        assert_eq!(timestamp_ms(text), expected, "timestamp of {text:?}");
    }
}

/// Checks the calendar edges the mutation check would otherwise miss.
///
/// Covers: rust-storage/timestamps
#[test]
fn timestamps_edges() {
    let edges: [(&str, Option<i64>); 15] = [
        ("2026-01-31T00:00:00.000Z", Some(1_769_817_600_000)),
        ("2026-04-30T00:00:00.000Z", Some(1_777_507_200_000)),
        ("2026-04-31T00:00:00.000Z", None),
        ("2026-02-29T00:00:00.000Z", None),
        ("2000-02-29T00:00:00.000Z", Some(951_782_400_000)),
        ("1900-02-29T00:00:00.000Z", None),
        ("2026-00-01T00:00:00.000Z", None),
        ("2026-01-00T00:00:00.000Z", None),
        ("2026-01-01T24:00:00.000Z", None),
        ("2026-01-01T00:60:00.000Z", None),
        ("2026-01-01T00:00:60.000Z", None),
        ("2026x10-01T00:00:00.000Z", None),
        ("2026-10-01T00x00:00.000Z", None),
        ("2026-10-01T00:00:00.000X", None),
        ("2026-10-01T00.00:00.000Z", None),
    ];
    for (text, expected) in edges {
        assert_eq!(timestamp_ms(text), expected, "timestamp of {text:?}");
    }
}
