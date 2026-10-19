//! Corpus test: the Rust merge gives the result `openspec archive` gives on
//! every differential case of rust-specs "Archive cases match `OpenSpec`".
//!
//! It runs the `OpenSpec` CLI over `tests/fixtures/openspec-diff/`, so it is a
//! corpus test (rust-core "Corpus tests"): each test carries the corpus ignore,
//! and only a build with the `parity` feature compiles it.

pub mod openspec_parity_support;

use openspec_parity_support::cli::{OpenSpecCli, text_of};
use openspec_parity_support::project::Project;
use openspec_parity_support::trees::{copy_tree, folders, name_of, read_tree, repository_root};
use osq_kernel_specs::{MergeChangeError, merge_change};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Output;

/// Declares one test per differential case and the list the exact-set test uses.
macro_rules! case_tests {
    ($($test:ident => $folder:literal),* $(,)?) => {
        /// The cases the tests below cover, as test name and folder name.
        const CASES: &[(&str, &str)] = &[$((stringify!($test), $folder)),*];

        $(
            #[doc = "Covers: rust-specs/archive-cases-match-openspec"]
            #[ignore = "corpus test: runs the OpenSpec CLI on the differential cases"]
            #[test]
            fn $test() {
                check_case($folder);
            }
        )*
    };
}

#[rustfmt::skip]
case_tests!(
    added => "added", bare_rename => "bare-rename", dropped_scenario => "dropped-scenario",
    duplicate_added => "duplicate-added", given_and => "given-and", modified => "modified",
    new_capability => "new-capability", removed => "removed", renamed => "renamed",
    second_change => "second-change",
);

/// The differential fixture cases folder.
fn fixtures() -> PathBuf {
    repository_root().join("tests/fixtures/openspec-diff")
}

/// Checks one case as its `case.json` names.
fn check_case(folder: &str) {
    let dir = fixtures().join(folder);
    let config = case_config(&dir);
    let repo = repository_root();
    let cli = OpenSpecCli::locate(&repo);
    let cli_project = build(&format!("{folder}-cli"), &dir, &repo);
    let rust_project = build(&format!("{folder}-rust"), &dir, &repo);
    match config.as_str() {
        "identical" => check_identical(&cli, &cli_project, &rust_project),
        "both-refuse" => check_both_refuse(&cli, &cli_project, &rust_project, &dir),
        "osq-refuses" => check_osq_refuses(&cli, &cli_project, &rust_project, &dir),
        other => panic!("case {folder}: unknown expect `{other}`"),
    }
}

/// Reads a case's expected result from `case.json`.
#[rustfmt::skip]
fn case_config(dir: &Path) -> String {
    let text = std::fs::read_to_string(dir.join("case.json")).expect("the case config reads");
    let value: Value = serde_json::from_str(&text).expect("the case config parses");
    value.get("expect").and_then(Value::as_str).expect("expect").to_string()
}

/// Builds one temporary project from a case, with its specs and changes.
#[rustfmt::skip]
fn build(name: &str, dir: &Path, repo: &Path) -> Project {
    let project = Project::prepare(name, repo).expect("the project scaffolds");
    let specs = dir.join("specs");
    project.set_specs(specs.is_dir().then_some(specs.as_path())).expect("the case specs copy");
    copy_tree(&dir.join("changes"), &project.root().join("openspec/changes")).expect("changes copy");
    project
}

/// The project's change folder names, in byte order of their names.
#[rustfmt::skip]
fn change_names(project: &Project) -> Vec<String> {
    folders(&project.root().join("openspec/changes")).into_iter().map(|path| name_of(&path)).collect()
}

/// The project's first change folder name.
#[rustfmt::skip]
fn first_change(project: &Project) -> String {
    change_names(project).into_iter().next().expect("the case has a change")
}

/// Runs `openspec validate` on one change in `project`.
#[rustfmt::skip]
fn validate(cli: &OpenSpecCli, project: &Project, change: &str) -> Output {
    let args = ["validate", change, "--type", "change", "--strict", "--json", "--no-interactive"];
    cli.run(&args, project.root())
}

/// Runs `openspec archive` on one change in `project`.
fn archive(cli: &OpenSpecCli, project: &Project, change: &str) -> Output {
    cli.run(&["archive", change, "--yes", "--json"], project.root())
}

/// Asserts the CLI run succeeded, naming its output when it did not.
#[rustfmt::skip]
fn assert_ok(output: &Output, label: &str) {
    assert!(output.status.success(), "{label} failed:\n{}", text_of(output));
}

/// Merges one change into `project`'s living specs with the Rust merge.
#[rustfmt::skip]
fn merge(project: &Project, change: &str) -> Result<(), MergeChangeError> {
    let changes = project.root().join("openspec/changes").join(change);
    let specs = project.root().join("openspec/specs");
    for spec in merge_change(&changes, &specs)? {
        let folder = specs.join(&spec.capability);
        match spec.text {
            Some(text) => {
                std::fs::create_dir_all(&folder).expect("the capability folder");
                std::fs::write(folder.join("spec.md"), text).expect("the spec writes");
            }
            None => { let _ = std::fs::remove_dir_all(&folder); }
        }
    }
    Ok(())
}

/// Every regular file under `root`, or none when the folder is absent.
#[rustfmt::skip]
fn specs_tree(root: &Path) -> BTreeMap<String, String> {
    if root.is_dir() { read_tree(root).expect("the specs tree reads") } else { BTreeMap::new() }
}

/// Checks an `identical` case: both sides accept and end with equal specs.
#[rustfmt::skip]
fn check_identical(cli: &OpenSpecCli, cli_project: &Project, rust_project: &Project) {
    let changes = change_names(cli_project);
    for change in &changes {
        assert_ok(&validate(cli, cli_project, change), &format!("validate {change}"));
    }
    for change in &changes {
        assert_ok(&archive(cli, cli_project, change), &format!("archive {change}"));
    }
    for change in &changes {
        merge(rust_project, change).unwrap_or_else(|error| panic!("merge {change}: {error}"));
    }
    let openspec = specs_tree(&cli_project.root().join("openspec/specs"));
    let rust = specs_tree(&rust_project.root().join("openspec/specs"));
    assert_eq!(openspec, rust, "the two specs trees differ");
}

/// Checks a `both-refuse` case: the first change fails on both sides.
#[rustfmt::skip]
fn check_both_refuse(cli: &OpenSpecCli, cli_project: &Project, rust_project: &Project, dir: &Path) {
    let first = first_change(cli_project);
    let output = archive(cli, cli_project, &first);
    let text = text_of(&output);
    assert!(!output.status.success(), "archive {first} succeeded:\n{text}");
    assert!(has_status_code(&output, "archive_spec_update_failed"), "no archive_spec_update_failed:\n{text}");
    let error = merge(rust_project, &first).expect_err("the Rust merge must refuse");
    assert!(matches!(error, MergeChangeError::Merge { .. }), "not a merge: {error}");
    assert_tree_is_base(cli_project, dir, "the CLI tree");
    assert_tree_is_base(rust_project, dir, "the Rust tree");
}

/// True when the CLI's `--json` output holds `code` in its `status` entries.
#[rustfmt::skip]
fn has_status_code(output: &Output, code: &str) -> bool {
    let value: Value = serde_json::from_slice(&output.stdout).unwrap_or(Value::Null);
    let entries = value.get("status").and_then(Value::as_array);
    entries.is_some_and(|list| list.iter().any(|e| e.get("code").and_then(Value::as_str) == Some(code)))
}

/// Asserts the project's specs still equal the case's own `specs/` tree.
#[rustfmt::skip]
fn assert_tree_is_base(project: &Project, dir: &Path, label: &str) {
    let actual = specs_tree(&project.root().join("openspec/specs"));
    assert_eq!(specs_tree(&dir.join("specs")), actual, "{label} changed the base specs");
}

/// Checks an `osq-refuses` case: only the Rust merge refuses the rename.
#[rustfmt::skip]
fn check_osq_refuses(cli: &OpenSpecCli, cli_project: &Project, rust_project: &Project, dir: &Path) {
    let first = first_change(cli_project);
    let error = merge(rust_project, &first).expect_err("the Rust merge must refuse");
    let MergeChangeError::Merge { error: refusal, .. } = &error else { panic!("not a merge: {error}") };
    assert!(refusal.to_string().contains("### Requirement:"), "refusal: {refusal}");
    let output = archive(cli, cli_project, &first);
    assert_ok(&output, &format!("archive {first}"));
    let living = specs_tree(&cli_project.root().join("openspec/specs"));
    for target in rename_targets(dir) {
        let present = living.values().any(|text| text.contains(&format!("### Requirement: {target}")));
        assert!(!present, "OpenSpec applied a rename it should skip: {target}");
    }
}

/// The `TO:` names of every delta spec of a case.
#[rustfmt::skip]
fn rename_targets(dir: &Path) -> Vec<String> {
    let mut targets = Vec::new();
    for change in folders(&dir.join("changes")) {
        for capability in folders(&change.join("specs")) {
            let Ok(text) = std::fs::read_to_string(capability.join("spec.md")) else { continue; };
            targets.extend(text.lines().filter_map(to_target).filter(|name| !name.is_empty()));
        }
    }
    targets
}

/// The `TO:` name on one delta line, as the TypeScript test reads it.
fn to_target(line: &str) -> Option<String> {
    let rest = after_prefix(trim_bullet(line.trim_start()), "TO:")?.trim();
    Some(strip_requirement(rest.trim_matches('`').trim()).to_string())
}

/// Removes one optional list bullet and the whitespace after it.
#[rustfmt::skip]
fn trim_bullet(line: &str) -> &str {
    line.strip_prefix(['-', '*', '+']).unwrap_or(line).trim_start()
}

/// The text after `prefix`, ignoring ASCII case, or none.
#[rustfmt::skip]
fn after_prefix<'a>(text: &'a str, prefix: &str) -> Option<&'a str> {
    let head = text.get(..prefix.len())?;
    head.eq_ignore_ascii_case(prefix).then(|| &text[prefix.len()..])
}

/// Removes a leading `### Requirement:` from a rename target, any case.
#[rustfmt::skip]
fn strip_requirement(text: &str) -> &str {
    after_prefix(text, "###")
        .and_then(|rest| after_prefix(rest.trim_start(), "Requirement:"))
        .map_or(text, |rest| rest.trim_start())
}

/// Covers: rust-specs/archive-cases-match-openspec
#[rustfmt::skip]
#[ignore = "corpus test: runs the OpenSpec CLI on the differential cases"]
#[test]
fn cases_are_exactly_the_fixture_folders() {
    let declared: Vec<&str> = CASES.iter().map(|(_, folder)| *folder).collect();
    let actual: Vec<String> = folders(&fixtures()).into_iter().map(|path| name_of(&path)).collect();
    assert_eq!(declared, actual, "the declared cases and the folders differ");
}
