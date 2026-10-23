//! Proves the proposal verify, Surface and change verify findings.

mod copy;
mod support;

use std::path::Path;

use osq_core::FeatureError;

use support::{run, write};

/// The proposal file every row writes when it has one.
const PROP: &str = "openspec/changes/001-clean/proposal.md";
/// The package manifest that names the `test` script.
const PKG: &str = "package.json";
/// The root manifest holding the `test` script.
const PKG_TEXT: &str = "{\"scripts\":{\"test\":\"node t.js\"}}";
/// The file prefix every proposal finding carries.
const PREFIX: &str = "001-clean: error openspec/changes/001-clean/proposal.md";
/// The message after the template placeholder.
const PLACEHOLDER: &str = "node -e \"process.exit(0)\"; replace it with a real command that \
                           verifies the completed change's final tree";

/// One row: its files and either its output or its failure message.
struct Row {
    /// The scratch root's folder name for this row.
    name: &'static str,
    /// The files to write over the copied fixture.
    files: Vec<(&'static str, String)>,
    /// The row's output or failure message.
    result: Result<String, String>,
}

/// A clean proposal whose verify command is `command`.
fn proposal(command: &str) -> String {
    format!("---\nverify: {command}\n---\n## Goal\n\nSum a list.\n\n## Surface\n\nNone\n")
}

/// Every row of "Proposal verify and Surface findings", in the scenario's order.
fn rows() -> Vec<Row> {
    let mut rows = rows_missing();
    rows.extend(rows_analysis());
    rows
}

/// One group of "Proposal verify and Surface findings" rows.
fn rows_missing() -> Vec<Row> {
    let missing_verify = format!(
        "001-clean: 2 findings\n\
         {PREFIX}: proposal.md must declare a verify command in frontmatter\n\
         {PREFIX} (Surface): proposal.md needs a ## Surface section: list the commands, flags, \
         config keys, frontmatter fields, document sections, dead reasons, and event types this \
         change adds, changes, or removes, or write None"
    );
    let blank_surface = format!(
        "001-clean: 1 finding\n\
         {PREFIX} (Surface): proposal.md needs a ## Surface section: list the commands, flags, \
         config keys, frontmatter fields, document sections, dead reasons, and event types this \
         change adds, changes, or removes, or write None"
    );
    vec![
        Row {
            name: "missing_verify_and_surface",
            files: vec![(PROP, "## Goal\n\nSum a list.\n".to_owned())],
            result: Err(missing_verify),
        },
        Row {
            name: "blank_surface",
            files: vec![(
                PROP,
                "---\nverify: cargo test -p delta\n---\n## Goal\n\n## Surface\n\n<!-- later -->\n"
                    .to_owned(),
            )],
            result: Err(blank_surface),
        },
        Row {
            name: "placeholder_quoted",
            files: vec![(PROP, proposal("node -e 'process.exit(0)'"))],
            result: Err(format!(
                "001-clean: 1 finding\n{PREFIX}: proposal.md verify is the template placeholder \
                 {PLACEHOLDER}"
            )),
        },
        Row {
            name: "placeholder_eval",
            files: vec![(PROP, proposal("node --eval 'process.exit(0);'"))],
            result: Err(format!(
                "001-clean: 1 finding\n{PREFIX}: proposal.md verify is the template placeholder \
                 {PLACEHOLDER}"
            )),
        },
    ]
}

/// One group of "Proposal verify and Surface findings" rows.
fn rows_analysis() -> Vec<Row> {
    vec![
        Row {
            name: "missing_script",
            files: vec![
                (PKG, PKG_TEXT.to_owned()),
                (PROP, proposal("pnpm run lint")),
            ],
            result: Err(format!(
                "001-clean: 1 finding\n{PREFIX}: proposal.md verify references package script \
                 \"lint\" that is not defined in the root package.json"
            )),
        },
        Row {
            name: "existing_script",
            files: vec![(PKG, PKG_TEXT.to_owned()), (PROP, proposal("pnpm test"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "unresolved",
            files: vec![(PROP, proposal("make check"))],
            result: Ok(
                "001-clean: warning openspec/changes/001-clean/proposal.md: proposal.md \
                          verify names neither an existing repository path nor a package script: \
                          \"make check\"\n001-clean: valid\n"
                    .to_owned(),
            ),
        },
        Row {
            name: "existing_path",
            files: vec![(PROP, proposal("sh crates/delta/src/lib.rs"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "chain",
            files: vec![(PROP, proposal("make check && make test"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "chain_semicolon",
            files: vec![(PROP, proposal("make check; make test"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "chain_pipe",
            files: vec![(PROP, proposal("make check | tee out"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
    ]
}

/// Proves every row of "Proposal verify and Surface findings" on its own copy.
///
/// Covers: rust-lint/proposal-verify-and-surface-findings
#[test]
fn lint_proposal_verify() {
    prove(rows(), "lint_proposal_verify");
}

/// The warning an unresolved verify command gives.
fn unresolved(command: &str) -> String {
    format!(
        "001-clean: warning openspec/changes/001-clean/proposal.md: proposal.md verify names \
         neither an existing repository path nor a package script: \"{command}\"\n001-clean: \
         valid\n"
    )
}

/// One row of the token-naming rules outside the scenario table.
fn rows_tokens() -> Vec<Row> {
    vec![
        Row {
            name: "placeholder_wrong_flag",
            files: vec![(PROP, proposal("node -x process.exit(0)"))],
            result: Ok(unresolved("node -x process.exit(0)")),
        },
        Row {
            name: "placeholder_other_expression",
            files: vec![(PROP, proposal("node -e x"))],
            result: Ok(unresolved("node -e x")),
        },
        Row {
            name: "existing_bare_path",
            files: vec![(PROP, proposal("sh Cargo.toml"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "bare_first_token",
            files: vec![(PROP, proposal("Cargo.toml"))],
            result: Ok(unresolved("Cargo.toml")),
        },
        Row {
            name: "backslash_first_token",
            files: vec![("a\\b", "x\n".to_owned()), (PROP, proposal("a\\b"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "option_token",
            files: vec![("-x", "x\n".to_owned()), (PROP, proposal("sh -x"))],
            result: Ok(unresolved("sh -x")),
        },
        Row {
            name: "equals_token",
            files: vec![("KEY=v", "x\n".to_owned()), (PROP, proposal("sh KEY=v"))],
            result: Ok(unresolved("sh KEY=v")),
        },
        Row {
            name: "url_token",
            files: vec![
                ("file:/etc/passwd", "x\n".to_owned()),
                (PROP, proposal("sh file:///etc/passwd")),
            ],
            result: Ok(unresolved("sh file:///etc/passwd")),
        },
        Row {
            name: "invalid_scheme_token",
            files: vec![("a_:/x", "x\n".to_owned()), (PROP, proposal("sh a_://x"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "valid_scheme_token",
            files: vec![("ab:/x", "x\n".to_owned()), (PROP, proposal("sh ab://x"))],
            result: Ok(unresolved("sh ab://x")),
        },
    ]
}

/// Proves the token-naming rules the verify analysis applies.
///
/// Covers: rust-lint/proposal-verify-and-surface-findings
#[test]
fn lint_proposal_verify_tokens() {
    prove(rows_tokens(), "lint_proposal_verify_tokens");
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
