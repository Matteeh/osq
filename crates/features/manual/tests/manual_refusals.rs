//! Proves manual's refusals against the goldens TypeScript printed.

mod support;

#[path = "../src/paths.rs"]
mod paths;

/// The refusal cases of `cases.json`, in the requirement's order.
const CASES: [&str; 9] = [
    "block",
    "vcs-off",
    "no-git",
    "nested",
    "blank-comment",
    "change-path",
    "no-edits-path",
    "nothing-to-keep",
    "only-untracked",
];

/// Proves every row of "Manual refusals equal TypeScript's".
///
/// Covers: rust-manual/manual-refusals-equal-typescript-s
#[test]
fn manual_refusals_equal_typescripts() {
    for name in CASES {
        support::check_case(name);
    }
}

/// Proves the path rules TypeScript's `path.posix.normalize` gives.
///
/// Covers: rust-manual/manual-refusals-equal-typescript-s
#[test]
fn path_rules_match_typescript() {
    let cases: [(&str, &str); 10] = [
        ("", "."),
        (".", "."),
        ("src/", "src"),
        ("//a//b/", "/a/b"),
        ("a/./b/../c", "a/c"),
        ("../../x", "../../x"),
        ("/../x", "/x"),
        ("/", ""),
        ("///", ""),
        (r"notes\sub\..\x", "notes/x"),
    ];
    for (path, expected) in cases {
        assert_eq!(paths::normalize(path), expected, "{path}");
    }
    assert!(paths::is_under_changes("openspec/changes"));
    assert!(paths::is_under_changes("openspec/changes/005-draft/x.md"));
    assert!(!paths::is_under_changes("openspec/changesx"));
    assert_eq!(
        paths::refused_named_path(&[
            "src/app.ts".to_owned(),
            "openspec/changes/../changes/005-draft/x.md".to_owned(),
        ]),
        Some(
            "openspec/changes/../changes/005-draft/x.md belongs to a change; osq manual keeps edits outside openspec/changes"
                .to_owned()
        )
    );
    let entry = |path: &str| osq_kernel_vcs::StatusEntry {
        code: " M".to_owned(),
        path: path.to_owned(),
        from: None,
    };
    assert!(paths::names_entry("src/app.ts", &entry("src/app.ts")));
    assert!(paths::names_entry("src", &entry("src/app.ts")));
    assert!(paths::names_entry("src/", &entry("src/app.ts")));
    assert!(!paths::names_entry("src/app.ts", &entry("src/app.tsx")));
    let status = [
        entry("src/app.ts"),
        osq_kernel_vcs::StatusEntry {
            code: "??".to_owned(),
            path: "notes.txt".to_owned(),
            from: None,
        },
        entry("openspec/changes/004-active/proposal.md"),
    ];
    let all: Vec<String> = paths::select_entries(&status, &[])
        .into_iter()
        .map(|entry| entry.path)
        .collect();
    assert_eq!(
        all,
        ["src/app.ts", "openspec/changes/004-active/proposal.md"]
    );
    let untracked = vec!["notes.txt".to_owned()];
    let named: Vec<String> = paths::select_entries(&status, &untracked)
        .into_iter()
        .map(|entry| entry.path)
        .collect();
    assert_eq!(named, ["notes.txt"]);
}

/// Proves a tracked change edit is dropped before the nothing-to-keep refusal.
///
/// Covers: rust-manual/manual-refusals-equal-typescript-s
#[test]
fn tracked_change_edits_are_not_kept() {
    assert_eq!(
        support::tracked_change_refusal(),
        "nothing to keep: the checkout has no uncommitted edits outside openspec/changes"
    );
}
