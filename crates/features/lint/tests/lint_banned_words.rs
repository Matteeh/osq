//! Proves the warnings the banned word rule gives.

mod copy;
mod support;

use osq_core::FeatureError;

use support::{run, write};

/// The proposal file the assumption row writes.
const PROP: &str = "openspec/changes/001-clean/proposal.md";
/// The task file every row writes.
const TASK: &str = "openspec/changes/001-clean/tasks/1.md";
/// The delta spec row "Fenced code and scenario quotes" writes.
const SPEC: &str = "openspec/changes/001-clean/specs/delta/spec.md";
/// The ban every row uses unless it writes its own `osq.toml`.
const BAN: &str = "[[bannedWords]]\nword = \"legacy\"\npaths = [\"crates/**\"]\n";
/// The start of the warning every first row expects.
const WARNING: &str =
    "001-clean: warning openspec/changes/001-clean/tasks/1.md: Banned word \"legacy\" in";
/// The first ban's closing text.
const INSIDE: &str = "bannedWords[0] bans it in crates/**; name it another way";

/// One row: its files and either its output or its failure message.
struct Row {
    /// The scratch root's folder name for this row.
    name: &'static str,
    /// The files to write over the copied fixture.
    files: Vec<(&'static str, String)>,
    /// The row's output or failure message.
    result: Result<String, String>,
}

/// A task file with `scope` and `body` in its frontmatter and acceptance text.
fn task(scope: &str, body: &str) -> String {
    format!(
        "---\ntitle: When x, y\nverify: cargo test\nscope:\n  - {scope}\n---\n## Acceptance\n\n- [ \
         ] {body}\n"
    )
}

/// The first five rows of "Banned word warnings", in the scenario's order.
fn rows_a() -> Vec<Row> {
    let scope = "crates/delta/src/lib.rs";
    vec![
        Row {
            name: "code_span",
            files: vec![
                ("osq.toml", BAN.to_owned()),
                (TASK, task(scope, "Set `legacyMode` to false.")),
            ],
            result: Ok(format!(
                "{WARNING} \"legacyMode\": {INSIDE}\n001-clean: valid\n"
            )),
        },
        Row {
            name: "case_insensitive",
            files: vec![
                ("osq.toml", BAN.to_owned()),
                (TASK, task(scope, "Print `Mode: LEGACY (old)`.")),
            ],
            result: Ok(format!(
                "{WARNING} \"Mode: LEGACY (old)\": {INSIDE}\n001-clean: valid\n"
            )),
        },
        Row {
            name: "outside_paths",
            files: vec![
                ("osq.toml", BAN.to_owned()),
                (TASK, task(scope, "Run `tests/legacy-free.rs`.")),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "inside_paths",
            files: vec![
                ("osq.toml", BAN.to_owned()),
                (TASK, task(scope, "Remove `crates/delta/src/legacy.rs`.")),
            ],
            result: Ok(format!(
                "{WARNING} \"crates/delta/src/legacy.rs\": {INSIDE}\n001-clean: valid\n"
            )),
        },
        Row {
            name: "plain_text",
            files: vec![
                ("osq.toml", BAN.to_owned()),
                (TASK, task(scope, "Drop the legacy flag.")),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
    ]
}

/// The last four rows of "Banned word warnings", in the scenario's order.
fn rows_b() -> Vec<Row> {
    let scope = "crates/delta/src/lib.rs";
    vec![
        Row {
            name: "scope_misses",
            files: vec![
                ("osq.toml", BAN.to_owned()),
                (TASK, task("tests/a.rs", "Set `legacyMode` to false.")),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "glob_scope",
            files: vec![
                (
                    "osq.toml",
                    "[[bannedWords]]\nword = \"legacy\"\npaths = [\"crates/delta/**\"]\n"
                        .to_owned(),
                ),
                (TASK, task("crates/**", "Set `legacyMode` to false.")),
            ],
            result: Ok(format!(
                "{WARNING} \"legacyMode\": bannedWords[0] bans it in crates/delta/**; name it \
                 another way\n001-clean: valid\n"
            )),
        },
        Row {
            name: "two_bans",
            files: vec![
                (
                    "osq.toml",
                    "[[bannedWords]]\nword = \"legacy\"\npaths = [\"docs/**\"]\n\n\
                     [[bannedWords]]\nword = \"LEGACY\"\npaths = [\"crates/**\", \"src/**\"]\n"
                        .to_owned(),
                ),
                (TASK, task(scope, "Set `legacyMode` to false.")),
            ],
            result: Ok(format!(
                "{} \"legacyMode\": bannedWords[1] bans it in crates/**, src/**; name it \
                 another way\n001-clean: valid\n",
                WARNING.replace("legacy", "LEGACY")
            )),
        },
        Row {
            name: "error_then_warning",
            files: vec![
                ("osq.toml", BAN.to_owned()),
                (TASK, task(scope, "Set `legacyMode` to false.")),
                (
                    PROP,
                    "## Goal\n\nSum a list.\n\n## Assumptions\n\n".to_owned(),
                ),
            ],
            result: Err(format!(
                "001-clean: 4 findings\n\
                 001-clean: error openspec/changes/001-clean/proposal.md: proposal.md must declare \
                 a verify command in frontmatter\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Surface): proposal.md \
                 needs a ## Surface section: list the commands, flags, config keys, frontmatter \
                 fields, document sections, dead reasons, and event types this change adds, \
                 changes, or removes, or write None\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Assumptions): \
                 proposal.md's ## Assumptions section is empty: write None or one line per \
                 assumption\n\
                 {WARNING} \"legacyMode\": {INSIDE}"
            )),
        },
    ]
}

/// Proves every row of "Banned word warnings" on its own fixture copy.
///
/// Covers: rust-lint/banned-word-warnings
#[test]
fn lint_banned_words() {
    for row in rows_a().into_iter().chain(rows_b()) {
        let root = copy::fixture(&format!("lint_banned_words/{}", row.name));
        for (path, contents) in &row.files {
            write(&root, path, contents);
        }
        assert_result(&root, &row);
    }
}

/// Proves "Fenced code and scenario quotes" on its own fixture copy.
///
/// Covers: rust-lint/fenced-code-and-scenario-quotes
#[test]
fn lint_fenced_code_and_scenario_quotes() {
    let root = copy::fixture("lint_banned_words/fenced_and_quotes");
    write(&root, "osq.toml", BAN);
    write(
        &root,
        TASK,
        "---\ntitle: When x, y\nverify: cargo test\nscope:\n  - crates/**\n---\n## \
         Acceptance\n\n- [ ] Add the mode.\n\n```rust\nlet mode = \"legacy\";\n```\n",
    );
    write(
        &root,
        SPEC,
        "## ADDED Requirements\n\n### Requirement: Sums lists\nThe system SHALL sum a list.\n\n#### \
         Scenario: Sum of three\n- **WHEN** one, two and three are summed\n- **THEN** the sum is \
         six and it prints \"legacy mode\"\n",
    );
    let expected = "001-clean: warning openspec/changes/001-clean/tasks/1.md: Banned word \
                    \"legacy\" in \"let mode = \"legacy\";\": bannedWords[0] bans it in \
                    crates/**; name it another way\n001-clean: warning \
                    openspec/changes/001-clean/specs/delta/spec.md: Banned word \"legacy\" in \
                    \"legacy mode\": bannedWords[0] bans it in crates/**; name it another \
                    way\n001-clean: valid\n";
    match run(&root, "1") {
        Ok(output) => assert_eq!(output.text, expected),
        Err(error) => panic!("expected output, got {error:?}"),
    }
}

/// Proves task files are checked in numeric-aware name order.
///
/// Covers: rust-lint/banned-word-warnings
#[test]
fn lint_banned_word_task_order() {
    let root = copy::fixture("lint_banned_words/task_order");
    write(&root, "osq.toml", BAN);
    write(
        &root,
        "openspec/changes/001-clean/tasks/10.md",
        task("crates/**", "Set `legacy ten` to false."),
    );
    write(
        &root,
        "openspec/changes/001-clean/tasks/2.md",
        task("crates/**", "Set `legacy two` to false."),
    );
    let expected = "001-clean: warning openspec/changes/001-clean/tasks/2.md: Banned word \
                    \"legacy\" in \"legacy two\": bannedWords[0] bans it in crates/**; name it \
                    another way\n001-clean: warning \
                    openspec/changes/001-clean/tasks/10.md: Banned word \"legacy\" in \"legacy \
                    ten\": bannedWords[0] bans it in crates/**; name it another way\n001-clean: \
                    valid\n";
    assert_output(&root, expected);
}

/// Proves the texts of one file keep file order, deduplicate, and ignore
/// quoted text outside a scenario heading.
///
/// Covers: rust-lint/banned-word-warnings
#[test]
fn lint_banned_word_texts() {
    let root = copy::fixture("lint_banned_words/texts");
    write(&root, "osq.toml", BAN);
    write(
        &root,
        TASK,
        "---\ntitle: When x, y\nverify: cargo test\nscope:\n  - crates/**\n---\n## \
         Acceptance\n\n- [ ] Run ``legacy` and `legacy two`.\n- [ ] `legacy three`.\n\n#### \
         Scenario: Quote\n- **WHEN** it says \"legacy four\" and \"legacy five\"\n\n## Notes\n- [ \
         ] \"legacy six\"\n",
    );
    let expected = "001-clean: warning openspec/changes/001-clean/tasks/1.md: Banned word \
                    \"legacy\" in \"legacy\": bannedWords[0] bans it in crates/**; name it another \
                    way\n001-clean: warning openspec/changes/001-clean/tasks/1.md: Banned word \
                    \"legacy\" in \"legacy two\": bannedWords[0] bans it in crates/**; name it \
                    another way\n001-clean: warning \
                    openspec/changes/001-clean/tasks/1.md: Banned word \"legacy\" in \"legacy \
                    three\": bannedWords[0] bans it in crates/**; name it another way\n001-clean: \
                    warning openspec/changes/001-clean/tasks/1.md: Banned word \"legacy\" in \
                    \"legacy four\": bannedWords[0] bans it in crates/**; name it another \
                    way\n001-clean: warning openspec/changes/001-clean/tasks/1.md: Banned word \
                    \"legacy\" in \"legacy five\": bannedWords[0] bans it in crates/**; name it \
                    another way\n001-clean: valid\n";
    assert_output(&root, expected);
}

/// Checks a scratch root's output exactly.
fn assert_output(root: &std::path::Path, expected: &str) {
    match run(root, "1") {
        Ok(output) => assert_eq!(output.text, expected),
        Err(error) => panic!("expected output, got {error:?}"),
    }
}

/// Checks one row's output or failure against the scratch root.
fn assert_result(root: &std::path::Path, row: &Row) {
    match (run(root, "1"), &row.result) {
        (Ok(output), Ok(text)) => assert_eq!(&output.text, text, "{}", row.name),
        (Err(error), Err(text)) => match error {
            FeatureError::Failed {
                command, message, ..
            } => {
                assert_eq!(command, "lint", "{}: command", row.name);
                assert_eq!(&message, text, "{}", row.name);
            }
            other => panic!("{}: expected a failed error, got {other:?}", row.name),
        },
        (result, _) => panic!("{}: unexpected result {result:?}", row.name),
    }
}
