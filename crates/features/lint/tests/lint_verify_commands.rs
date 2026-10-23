//! Proves the task verify command analysis: placeholders, package scripts,
//! runners, named paths and the resulting warnings.

mod copy;
mod support;

use std::path::Path;

use osq_core::FeatureError;

use support::{run, write};

/// The task file every row writes.
const TASK: &str = "openspec/changes/001-clean/tasks/1.md";
/// The package manifest naming the `test` script.
const PKG: &str = "{\"scripts\":{\"test\":\"node t.js\"}}";
/// The task error prefix.
const ERROR: &str = "001-clean: error openspec/changes/001-clean/tasks/1.md: Task in 1.md";
/// The unresolved command warning prefix.
const UNRESOLVED: &str = "001-clean: warning openspec/changes/001-clean/tasks/1.md: Task in \
                          1.md verify names neither an existing repository path nor a package \
                          script:";
/// The uncreatable path warning prefix.
const NAMED: &str = "001-clean: warning openspec/changes/001-clean/tasks/1.md: Task in 1.md \
                    verify names";
/// The placeholder message tail.
const PLACEHOLDER: &str = "verify is the template placeholder node -e \"process.exit(0)\"; \
                           replace it with a real command that verifies the completed change's \
                           final tree";

/// One row: its command, files and either its output or its failure message.
struct Row {
    /// The scratch root's folder name for this row.
    name: &'static str,
    /// The task's verify command.
    command: &'static str,
    /// The files to write over the copied fixture.
    files: Vec<(&'static str, String)>,
    /// The row's output or failure message.
    result: Result<String, String>,
}

/// A task file whose verify command is `command`.
fn task(command: &str) -> String {
    format!("---\ntitle: T\nverify: {command}\nscope:\n  - crates/delta/src/lib.rs\n---\n- [ ] a\n")
}

/// Every row of "Verify command analysis", in the scenario's order.
fn rows_scenario() -> Vec<Row> {
    vec![
        Row {
            name: "placeholder_eval",
            command: "node --eval 'process.exit( 0 );;'",
            files: Vec::new(),
            result: Err(format!("001-clean: 1 finding\n{ERROR} {PLACEHOLDER}")),
        },
        Row {
            name: "existing_script",
            command: "npm test",
            files: vec![("package.json", PKG.to_owned())],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "package_subcommand",
            command: "pnpm install",
            files: Vec::new(),
            result: Ok(format!("{UNRESOLVED} \"pnpm install\"\n001-clean: valid\n")),
        },
        Row {
            name: "package_option",
            command: "pnpm --filter x test",
            files: Vec::new(),
            result: Ok(format!(
                "{UNRESOLVED} \"pnpm --filter x test\"\n001-clean: valid\n"
            )),
        },
        Row {
            name: "cargo_not_runner",
            command: "cargo publish",
            files: Vec::new(),
            result: Ok(format!(
                "{UNRESOLVED} \"cargo publish\"\n001-clean: valid\n"
            )),
        },
        Row {
            name: "existing_path",
            command: "sh crates/delta/src/lib.rs",
            files: Vec::new(),
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "tokens",
            command: "sh \"crates/delta/src/new file.rs\" KEY=a/b https://x.io/y -o/z",
            files: Vec::new(),
            result: Ok(format!(
                "{UNRESOLVED} \"sh \"crates/delta/src/new file.rs\" KEY=a/b https://x.io/y \
                 -o/z\"\n{NAMED} crates/delta/src/new file.rs, which no task in the change can \
                 create\n001-clean: valid\n"
            )),
        },
        Row {
            name: "glob_paths",
            command: "scripts/run.sh crates/delta/**/*.rs crates/none/*.rs",
            files: Vec::new(),
            result: Ok(format!(
                "{UNRESOLVED} \"scripts/run.sh crates/delta/**/*.rs crates/none/*.rs\"\n\
                 {NAMED} scripts/run.sh, which no task in the change can create\n\
                 {NAMED} crates/none/*.rs, which no task in the change can create\n001-clean: \
                 valid\n"
            )),
        },
    ]
}

/// Extra rows covering the guards the scenario table does not reach.
fn rows_extra() -> Vec<Row> {
    let mut rows = rows_extra_placeholders();
    rows.extend(rows_extra_scripts());
    rows.extend(rows_extra_paths());
    rows
}

/// The placeholder and expression guards.
fn rows_extra_placeholders() -> Vec<Row> {
    vec![
        Row {
            name: "placeholder_unquoted",
            command: "node -e process.exit(0)",
            files: Vec::new(),
            result: Err(format!("001-clean: 1 finding\n{ERROR} {PLACEHOLDER}")),
        },
        Row {
            name: "placeholder_wrong_flag",
            command: "node -x process.exit(0)",
            files: Vec::new(),
            result: Ok(format!(
                "{UNRESOLVED} \"node -x process.exit(0)\"\n001-clean: valid\n"
            )),
        },
        Row {
            name: "placeholder_other_expression",
            command: "node -e x",
            files: Vec::new(),
            result: Ok(format!("{UNRESOLVED} \"node -e x\"\n001-clean: valid\n")),
        },
    ]
}

/// The package-script and runner commands.
fn rows_extra_scripts() -> Vec<Row> {
    vec![
        Row {
            name: "missing_script",
            command: "pnpm run lint",
            files: vec![("package.json", PKG.to_owned())],
            result: Err(format!(
                "001-clean: 1 finding\n{ERROR} verify references package script \"lint\" that is \
                 not defined in the root package.json"
            )),
        },
        Row {
            name: "package_only",
            command: "pnpm",
            files: Vec::new(),
            result: Ok(format!("{UNRESOLVED} \"pnpm\"\n001-clean: valid\n")),
        },
        Row {
            name: "run_without_script",
            command: "pnpm run",
            files: Vec::new(),
            result: Ok(format!("{UNRESOLVED} \"pnpm run\"\n001-clean: valid\n")),
        },
        Row {
            name: "run_option",
            command: "pnpm run -x",
            files: Vec::new(),
            result: Ok(format!("{UNRESOLVED} \"pnpm run -x\"\n001-clean: valid\n")),
        },
        Row {
            name: "yarn_script",
            command: "yarn build",
            files: vec![(
                "package.json",
                "{\"scripts\":{\"build\":\"node b.js\"}}".to_owned(),
            )],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "bun_script",
            command: "bun test",
            files: vec![("package.json", PKG.to_owned())],
            result: Ok("001-clean: valid\n".to_owned()),
        },
    ]
}

/// The path-token and named-path guards.
fn rows_extra_paths() -> Vec<Row> {
    let mut rows = rows_extra_path_tokens();
    rows.extend(rows_extra_schemes());
    rows
}

/// The path-token guards.
fn rows_extra_path_tokens() -> Vec<Row> {
    vec![
        Row {
            name: "cargo_test",
            command: "cargo test --workspace",
            files: Vec::new(),
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "cargo_fmt",
            command: "cargo fmt --check",
            files: Vec::new(),
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "bare_existing_path",
            command: "sh Cargo.toml",
            files: Vec::new(),
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "bare_first_token",
            command: "Cargo.toml",
            files: Vec::new(),
            result: Ok(format!("{UNRESOLVED} \"Cargo.toml\"\n001-clean: valid\n")),
        },
        Row {
            name: "assignment_token",
            command: "sh KEY=v",
            files: Vec::new(),
            result: Ok(format!("{UNRESOLVED} \"sh KEY=v\"\n001-clean: valid\n")),
        },
        Row {
            name: "url_token",
            command: "sh https://x/y",
            files: Vec::new(),
            result: Ok(format!(
                "{UNRESOLVED} \"sh https://x/y\"\n001-clean: valid\n"
            )),
        },
    ]
}

/// The URL-scheme and duplicate-path guards.
fn rows_extra_schemes() -> Vec<Row> {
    vec![
        Row {
            name: "invalid_scheme",
            command: "sh a_://x",
            files: vec![("a_:/x", "x\n".to_owned())],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "invalid_scheme_missing",
            command: "sh a_://x",
            files: Vec::new(),
            result: Ok(format!(
                "{UNRESOLVED} \"sh a_://x\"\n{NAMED} a_://x, which no task in the change can \
                 create\n001-clean: valid\n"
            )),
        },
        Row {
            name: "valid_scheme",
            command: "sh ab://x",
            files: vec![("ab:/x", "x\n".to_owned())],
            result: Ok(format!("{UNRESOLVED} \"sh ab://x\"\n001-clean: valid\n")),
        },
        Row {
            name: "backslash_first",
            command: "a\\b",
            files: vec![("a\\b", "x\n".to_owned())],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "empty_quoted",
            command: "sh \"\"",
            files: Vec::new(),
            result: Ok(format!("{UNRESOLVED} \"sh \"\"\"\n001-clean: valid\n")),
        },
        Row {
            name: "glob_present",
            command: "sh crates/delta/**/*.rs",
            files: Vec::new(),
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "duplicate_path",
            command: "sh scripts/new.sh scripts/new.sh",
            files: Vec::new(),
            result: Ok(format!(
                "{UNRESOLVED} \"sh scripts/new.sh scripts/new.sh\"\n{NAMED} scripts/new.sh, \
                 which no task in the change can create\n001-clean: valid\n"
            )),
        },
    ]
}

/// A row whose task scope is `scope` and verify command is `command`.
fn scoped_row(
    name: &'static str,
    command: &'static str,
    scope: &'static str,
    result: Result<String, String>,
) -> Row {
    Row {
        name,
        command,
        files: vec![(
            TASK,
            format!("---\ntitle: T\nverify: {command}\nscope:\n  - {scope}\n---\n- [ ] a\n"),
        )],
        result,
    }
}

/// Rows whose task scope differs from the scenario's default.
fn rows_scopes() -> Vec<Row> {
    vec![
        scoped_row(
            "pattern_scope_covers_path",
            "sh scripts/new.sh",
            "scripts/**",
            Ok("001-clean: valid\n".to_owned()),
        ),
        scoped_row(
            "glob_scope_must_match_exactly",
            "sh scripts/*.sh",
            "scripts/**",
            Ok(format!(
                "{UNRESOLVED} \"sh scripts/*.sh\"\n{NAMED} scripts/*.sh, which no task in the \
                 change can create\n001-clean: valid\n"
            )),
        ),
    ]
}

/// Proves every row of "Verify command analysis" on its own copy.
///
/// Covers: rust-lint/verify-command-analysis
#[test]
fn lint_verify_commands() {
    prove(rows_scenario(), "lint_verify_commands");
}

/// Proves the verify analysis branches the scenario table leaves implicit.
///
/// Covers: rust-lint/verify-command-analysis
#[test]
fn lint_verify_command_edges() {
    prove(rows_extra(), "lint_verify_command_edges");
}

/// Proves the scope coverage rules the verify analysis applies to named paths.
///
/// Covers: rust-lint/verify-command-analysis
#[test]
fn lint_verify_command_scopes() {
    prove(rows_scopes(), "lint_verify_command_scopes");
}

/// Runs every row on its own scratch copy and checks its result.
fn prove(rows: Vec<Row>, prefix: &str) {
    for row in rows {
        let root = copy::fixture(&format!("{prefix}/{}", row.name));
        write(&root, TASK, task(row.command));
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
