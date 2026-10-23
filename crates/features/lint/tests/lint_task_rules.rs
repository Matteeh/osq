//! Proves the per-task and cross-task findings the task rules give.

mod copy;
mod support;

use std::path::Path;

use osq_core::FeatureError;

use support::{run, write};

/// The task file every row writes unless it writes its own.
const TASK: &str = "openspec/changes/001-clean/tasks/1.md";
/// The second task file the cross-task rows write.
const TASK_TWO: &str = "openspec/changes/001-clean/tasks/2.md";
/// The tenth task file the ordering rows write.
const TASK_TEN: &str = "openspec/changes/001-clean/tasks/10.md";
/// The fixture's clean verify command.
const VERIFY: &str = "verify: cargo test -p delta";
/// The task finding prefix for task `1.md`.
const TASK_ONE: &str = "001-clean: error openspec/changes/001-clean/tasks/1.md";
/// The warning prefix for task `1.md`.
const WARN_ONE: &str = "001-clean: warning openspec/changes/001-clean/tasks/1.md";
/// The placeholder error tail.
const PLACEHOLDER: &str = "verify is the template placeholder node -e \"process.exit(0)\"; \
                           replace it with a real command that verifies the completed change's \
                           final tree";
/// The brace group message tail.
const BRACE: &str = "holds a brace group, which osq scope globs do not expand; they support \
                     only *, **, ? and a trailing /. Use a folder glob such as dir/** or one \
                     entry per file";

/// One row: its files and either its output or its failure message.
struct Row {
    /// The scratch root's folder name for this row.
    name: &'static str,
    /// The files to write over the copied fixture.
    files: Vec<(&'static str, String)>,
    /// The row's output or failure message.
    result: Result<String, String>,
}

/// A task file with the given frontmatter lines.
fn task(frontmatter: &str) -> String {
    format!("---\ntitle: When x, y\n{frontmatter}\n---\n## Acceptance\n\n- [ ] Sum.\n")
}

/// A task's `scope` list.
fn scope(entries: &[&str]) -> String {
    let mut text = String::from("scope:\n");
    for entry in entries {
        text.push_str("  - ");
        text.push_str(entry);
        text.push('\n');
    }
    text.pop();
    text
}

/// The clean task with the given scope entries.
fn scoped(entries: &[&str]) -> String {
    task(&format!("{VERIFY}\n{}", scope(entries)))
}

/// Every row of "Task rule findings", in the scenario's order.
fn rows_scenario() -> Vec<Row> {
    vec![
        Row {
            name: "bad_frontmatter_and_fused",
            files: vec![(
                TASK,
                "---\ntitle: T\nverify: [\n---\n- [ ] a - [ ] b\n".to_owned(),
            )],
            result: Err(format!(
                "001-clean: 2 findings\n\
                 {TASK_ONE}: Task in 1.md frontmatter is not valid YAML at line 4: while \
                 parsing a node, did not find expected node content at byte 18 line 3 column 1\n\
                 {TASK_ONE}: Task in 1.md contains fused acceptance lines on line 5"
            )),
        },
        Row {
            name: "tests_modify_string",
            files: vec![(
                TASK,
                task(&format!(
                    "{VERIFY}\n{}\ntests:\n  modify: \"yes\"",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md tests.modify must be a boolean \
                 (got \"yes\")"
            )),
        },
        Row {
            name: "tests_modify_integer",
            files: vec![(
                TASK,
                task(&format!(
                    "{VERIFY}\n{}\ntests.modify: 1",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md tests.modify must be a boolean \
                 (got 1)"
            )),
        },
        Row {
            name: "gated_tests",
            files: vec![
                ("tests/old.rs", "fn old() {}\n".to_owned()),
                ("benches/b.rs", "fn b() {}\n".to_owned()),
                (
                    TASK,
                    task(&format!(
                        "{VERIFY}\n{}",
                        scope(&["tests/**", "benches/b.rs"])
                    )),
                ),
            ],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md scope touches existing test files \
                 (benches/b.rs, tests/old.rs) without tests.modify: true"
            )),
        },
        Row {
            name: "gated_tests_allowed",
            files: vec![
                ("tests/old.rs", "fn old() {}\n".to_owned()),
                (
                    TASK,
                    task(&format!(
                        "{VERIFY}\n{}\ntests:\n  modify: true",
                        scope(&["tests/**"])
                    )),
                ),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "empty_verify",
            files: vec![(TASK, task(&scope(&["crates/delta/src/lib.rs"])))],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md verify command is empty"
            )),
        },
        Row {
            name: "placeholder",
            files: vec![(
                TASK,
                task(&format!(
                    "verify: node -e 'process.exit(0)'\n{}",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md {PLACEHOLDER}"
            )),
        },
        Row {
            name: "chain_without_package",
            files: vec![(
                TASK,
                task(&format!(
                    "verify: cargo test && cargo clippy\n{}",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md verify chains commands (\"cargo \
                 test && cargo clippy\"); move the chain into a script file in the repository and \
                 name that file, for example scripts/verify.sh"
            )),
        },
        Row {
            name: "chain_with_package",
            files: vec![
                (
                    "package.json",
                    "{\"scripts\":{\"test\":\"node t.js\"}}".to_owned(),
                ),
                (
                    TASK,
                    task(&format!(
                        "verify: cargo test; cargo clippy\n{}",
                        scope(&["crates/delta/src/lib.rs"])
                    )),
                ),
            ],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md verify chains commands (\"cargo \
                 test; cargo clippy\"); move the chain into a package script and name that \
                 script, for example pnpm run <script>"
            )),
        },
        Row {
            name: "missing_script",
            files: vec![
                (
                    "package.json",
                    "{\"scripts\":{\"test\":\"node t.js\"}}".to_owned(),
                ),
                (
                    TASK,
                    task(&format!(
                        "verify: pnpm run lint\n{}",
                        scope(&["crates/delta/src/lib.rs"])
                    )),
                ),
            ],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md verify references package script \
                 \"lint\" that is not defined in the root package.json"
            )),
        },
        Row {
            name: "limits",
            files: vec![
                (
                    "osq.toml",
                    "[limits]\nmaxAcceptanceLines = 1\nmaxScopeFiles = 1\n".to_owned(),
                ),
                (
                    TASK,
                    "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - \
                     crates/delta/src/lib.rs\n  - crates/delta/Cargo.toml\n---\n- [ ] a\n- [ ] \
                     b\n"
                    .to_owned(),
                ),
            ],
            result: Err(format!(
                "001-clean: 2 findings\n\
                 {TASK_ONE}: Task in 1.md acceptance lines (2) exceeds limit 1\n\
                 {TASK_ONE}: Task in 1.md scope specifies 2 patterns, exceeding limit 1"
            )),
        },
        Row {
            name: "brace_groups",
            files: vec![(
                TASK,
                task(&format!(
                    "{VERIFY}\n{}\nentry:\n  - crates/**/entry\n  - crates/{{x,y}}/lib.rs",
                    scope(&["crates/delta/src/{a,b}.rs"])
                )),
            )],
            result: Err(format!(
                "001-clean: 2 findings\n\
                 {TASK_ONE}: Task in 1.md scope entry \"crates/delta/src/{{a,b}}.rs\" {BRACE}\n\
                 {TASK_ONE}: Task in 1.md entry \"crates/{{x,y}}/lib.rs\" {BRACE}"
            )),
        },
        Row {
            name: "harness",
            files: vec![
                ("src/harness/x.ts", "x\n".to_owned()),
                (TASK, scoped(&["src/harness/x.ts"])),
            ],
            result: Ok(format!(
                "{WARN_ONE}: Task in 1.md resolves src/harness/ scope but no file under \
                 tests/fixtures/events/\n001-clean: valid\n"
            )),
        },
        Row {
            name: "shared_scope",
            files: vec![(
                TASK_TWO,
                "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/**\n---\n- \
                 [ ] a\n"
                    .to_owned(),
            )],
            result: Ok(
                "001-clean: warning crates/delta/src/lib.rs: Tasks 1 and 2 share resolved scope \
                 file crates/delta/src/lib.rs\n001-clean: valid\n"
                    .to_owned(),
            ),
        },
        Row {
            name: "unresolved",
            files: vec![(
                TASK,
                task(&format!(
                    "verify: make check\n{}",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Ok(format!(
                "{WARN_ONE}: Task in 1.md verify names neither an existing repository path nor a \
                 package script: \"make check\"\n001-clean: valid\n"
            )),
        },
        Row {
            name: "creates_red",
            files: vec![(TASK, scoped(&["scripts/new.sh"]))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "creates_green",
            files: vec![(
                TASK,
                task(&format!(
                    "verify: sh scripts/new.sh\nverify_starts: green\n{}",
                    scope(&["scripts/new.sh"])
                )),
            )],
            result: Ok(format!(
                "{WARN_ONE}: Task in 1.md declares verify_starts: green but its verify names \
                 scripts/new.sh, which the task creates\n001-clean: valid\n"
            )),
        },
        Row {
            name: "uncreatable",
            files: vec![(
                TASK,
                task(&format!(
                    "verify: sh scripts/new.sh\n{}",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Ok(format!(
                "{WARN_ONE}: Task in 1.md verify names neither an existing repository path nor a \
                 package script: \"sh scripts/new.sh\"\n\
                 {WARN_ONE}: Task in 1.md verify names scripts/new.sh, which no task in the \
                 change can create\n001-clean: valid\n"
            )),
        },
        Row {
            name: "earlier_task_creates",
            files: vec![
                (TASK, scoped(&["scripts/new.sh"])),
                (
                    TASK_TWO,
                    "---\ntitle: T\nverify: sh scripts/new.sh\nscope:\n  - \
                     crates/delta/src/lib.rs\n---\n- [ ] a\n"
                        .to_owned(),
                ),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
    ]
}

/// Extra rows covering the rules the scenario table does not reach.
fn rows_extra() -> Vec<Row> {
    let mut rows = rows_extra_early();
    rows.extend(rows_extra_late());
    rows.extend(rows_extra_serialization());
    rows.extend(rows_extra_order());
    rows
}

/// The early extra rows: frontmatter and tests.modify.
fn rows_extra_early() -> Vec<Row> {
    let mut rows = rows_extra_frontmatter();
    rows.extend(rows_extra_braces());
    rows
}

/// The frontmatter and tests.modify guards.
fn rows_extra_frontmatter() -> Vec<Row> {
    vec![
        Row {
            name: "frontmatter_invalid_only",
            files: vec![(TASK, "---\ntitle: T\nverify: [\n---\n- [ ] a\n".to_owned())],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md frontmatter is not valid YAML at \
                 line 4: while parsing a node, did not find expected node content at byte 18 line \
                 3 column 1"
            )),
        },
        Row {
            name: "tests_modify_list",
            files: vec![(
                TASK,
                task(&format!(
                    "{VERIFY}\n{}\ntests.modify: [true]",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md tests.modify must be a boolean \
                 (got [true])"
            )),
        },
        Row {
            name: "tests_modify_mapping",
            files: vec![(
                TASK,
                task(&format!(
                    "{VERIFY}\n{}\ntests:\n  modify:\n    a: 1",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md tests.modify must be a boolean \
                 (got {{\"a\":1}})"
            )),
        },
        Row {
            name: "tests_modify_false",
            files: vec![
                ("tests/old.rs", "fn old() {}\n".to_owned()),
                (
                    TASK,
                    task(&format!(
                        "{VERIFY}\n{}\ntests:\n  modify: false",
                        scope(&["tests/old.rs"])
                    )),
                ),
            ],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md scope touches existing test files \
                 (tests/old.rs) without tests.modify: true"
            )),
        },
        Row {
            name: "one_checkbox",
            files: vec![(
                TASK,
                "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - \
                 crates/delta/src/lib.rs\n---\n- [ ] a and [ ]\n"
                    .to_owned(),
            )],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "brace_without_comma",
            files: vec![(TASK, scoped(&["crates/delta/src/{x}.rs"]))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
    ]
}

/// The brace and limit boundaries.
fn rows_extra_braces() -> Vec<Row> {
    vec![Row {
        name: "limits_at_equality",
        files: vec![
            (
                "osq.toml",
                "[limits]\nmaxAcceptanceLines = 1\nmaxScopeFiles = 1\n".to_owned(),
            ),
            (
                TASK,
                "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - \
                     crates/delta/src/lib.rs\n---\n- [ ] a\n"
                    .to_owned(),
            ),
        ],
        result: Ok("001-clean: valid\n".to_owned()),
    }]
}

/// The late extra rows: warnings, globs and shared scope files.
fn rows_extra_late() -> Vec<Row> {
    vec![
        Row {
            name: "harness_with_fixtures",
            files: vec![
                ("src/harness/x.ts", "x\n".to_owned()),
                ("tests/fixtures/events/e.json", "{}\n".to_owned()),
                (
                    TASK,
                    task(&format!(
                        "{VERIFY}\n{}\ntests:\n  modify: true",
                        scope(&["src/harness/x.ts", "tests/fixtures/events/**"])
                    )),
                ),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "unresolved_chain",
            files: vec![(
                TASK,
                task(&format!(
                    "verify: make check && make test\n{}",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md verify chains commands (\"make \
                 check && make test\"); move the chain into a script file in the repository and \
                 name that file, for example scripts/verify.sh"
            )),
        },
        Row {
            name: "creates_any",
            files: vec![(
                TASK,
                task(&format!(
                    "verify: sh scripts/new.sh\nverify_starts: any\n{}",
                    scope(&["scripts/new.sh"])
                )),
            )],
            result: Ok(format!(
                "{WARN_ONE}: Task in 1.md declares verify_starts: any but its verify names \
                 scripts/new.sh, which the task creates\n001-clean: valid\n"
            )),
        },
        Row {
            name: "glob_own_scope_exact",
            files: vec![(
                TASK,
                task(&format!(
                    "verify: sh scripts/*.sh\n{}",
                    scope(&["scripts/*.sh"])
                )),
            )],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "glob_not_covered_by_pattern",
            files: vec![(
                TASK,
                task(&format!(
                    "verify: sh scripts/*.sh\n{}",
                    scope(&["scripts/**"])
                )),
            )],
            result: Ok(format!(
                "{WARN_ONE}: Task in 1.md verify names neither an existing repository path nor a \
                 package script: \"sh scripts/*.sh\"\n\
                 {WARN_ONE}: Task in 1.md verify names scripts/*.sh, which no task in the change \
                 can create\n001-clean: valid\n"
            )),
        },
        Row {
            name: "bare_first_token",
            files: vec![(
                TASK,
                task(&format!(
                    "verify: Cargo.toml\n{}",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Ok(format!(
                "{WARN_ONE}: Task in 1.md verify names neither an existing repository path nor a \
                 package script: \"Cargo.toml\"\n001-clean: valid\n"
            )),
        },
        Row {
            name: "empty_quoted_token",
            files: vec![(
                TASK,
                task(&format!(
                    "verify: sh \"\"\n{}",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Ok(format!(
                "{WARN_ONE}: Task in 1.md verify names neither an existing repository path nor a \
                 package script: \"sh \"\"\"\n001-clean: valid\n"
            )),
        },
        Row {
            name: "existing_first_path",
            files: vec![
                ("scripts/run.sh", "x\n".to_owned()),
                (
                    TASK,
                    task(&format!(
                        "verify: ./scripts/run.sh\n{}",
                        scope(&["scripts/run.sh"])
                    )),
                ),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "shared_scope_sorted",
            files: vec![
                ("a/x.rs", "x\n".to_owned()),
                ("b/x.rs", "x\n".to_owned()),
                (
                    TASK,
                    task(&format!("{VERIFY}\n{}", scope(&["a/x.rs", "b/x.rs"]))),
                ),
                (
                    TASK_TWO,
                    "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - a/x.rs\n  - \
                     b/x.rs\n---\n- [ ] a\n"
                        .to_owned(),
                ),
            ],
            result: Ok(
                "001-clean: warning a/x.rs: Tasks 1 and 2 share resolved scope file a/x.rs\n\
                 001-clean: warning b/x.rs: Tasks 1 and 2 share resolved scope file b/x.rs\n\
                 001-clean: valid\n"
                    .to_owned(),
            ),
        },
    ]
}

/// The `tests.modify` values whose mapping keys are not strings.
fn rows_extra_serialization() -> Vec<Row> {
    let mut rows = Vec::new();
    for (name, line, got) in [
        ("tests_modify_integer_key", "    1: true", "{\"1\":true}"),
        (
            "tests_modify_boolean_key",
            "    true: false",
            "{\"true\":false}",
        ),
        ("tests_modify_null_key", "    null: x", "{\"null\":\"x\"}"),
    ] {
        rows.push(Row {
            name,
            files: vec![(
                TASK,
                task(&format!(
                    "{VERIFY}\n{}\ntests:\n  modify:\n{line}",
                    scope(&["crates/delta/src/lib.rs"])
                )),
            )],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE}: Task in 1.md tests.modify must be a boolean \
                 (got {got})"
            )),
        });
    }
    rows
}

/// The rows that order tasks by their leading digits.
fn rows_extra_order() -> Vec<Row> {
    vec![Row {
        name: "numeric_task_order",
        files: vec![
            (TASK, scoped(&["nothing/here"])),
            (
                TASK_TWO,
                "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/**\n---\n- \
                 [ ] a\n"
                    .to_owned(),
            ),
            (
                TASK_TEN,
                "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/**\n---\n- \
                 [ ] a\n"
                    .to_owned(),
            ),
        ],
        result: Ok(
            "001-clean: warning crates/delta/Cargo.toml: Tasks 2 and 10 share resolved scope \
             file crates/delta/Cargo.toml\n001-clean: warning crates/delta/src/lib.rs: Tasks 2 \
             and 10 share resolved scope file crates/delta/src/lib.rs\n001-clean: valid\n"
                .to_owned(),
        ),
    }]
}

/// Proves every row of "Task rule findings" on its own copy.
///
/// Covers: rust-lint/task-rule-findings
#[test]
fn lint_task_rules() {
    prove(rows_scenario(), "lint_task_rules");
}

/// Proves the task rule branches the scenario table leaves implicit.
///
/// Covers: rust-lint/task-rule-findings
#[test]
fn lint_task_rule_edges() {
    prove(rows_extra(), "lint_task_rule_edges");
}

/// Runs every row on its own scratch copy and checks its result.
fn prove(rows: Vec<Row>, prefix: &str) {
    for row in rows {
        let root = copy::fixture(&format!("{prefix}/{}", row.name));
        for (path, contents) in &row.files {
            write(&root, path, contents);
        }
        assert_result(&root, &row);
    }
}

/// Checks one row's output or failure against the scratch root.
fn assert_result(root: &Path, row: &Row) {
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
