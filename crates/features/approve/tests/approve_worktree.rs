//! Proves approvals into a branch and worktree against TypeScript's goldens.

mod worktree_support;

use std::fs;

use worktree_support::{
    SEAL, approve, build, golden, golden_message, golden_record, record_lines, render,
    scratch_copy, worktrees, write_config,
};

/// Proves every row of "Worktree approvals equal TypeScript's".
///
/// Covers: rust-approve/worktree-approvals-equal-typescript-s
#[test]
fn worktree_approvals_equal_typescript() {
    let rows = [
        ("draft-001", "1", "001-alpha-twice", None),
        ("committed-002", "2", "002-gamma", None),
        (
            "prepare-passes-001",
            "1",
            "001-alpha-twice",
            Some("prepare = \"echo prepared > prepared.txt\""),
        ),
    ];
    for (name, query, folder, extra) in rows {
        let extras: Vec<&str> = extra.into_iter().collect();
        let repo = build(name, &extras);
        let result = approve(&repo.path, &[query]);
        assert!(result.is_ok(), "{name}: {:?}", result.err());
        assert_eq!(
            format!("{}\n", render(&repo, folder, &result)),
            golden(&format!("{name}.txt")),
            "{name}: golden text"
        );
    }
}

/// Proves a failed prepare rolls back and a second approve succeeds.
///
/// Covers: rust-approve/prepare-failure-rolls-back
#[test]
fn prepare_failure_rolls_back() {
    let repo = build(
        "prepare-failure",
        &["prepare = \"echo prepare said no; exit 3\""],
    );
    let first = approve(&repo.path, &["1"]).expect_err("the failed prepare is refused");
    assert_eq!(
        first.to_string().trim_end(),
        format!(
            "approve failed: {}",
            golden_message(&repo, "prepare-fails-001.txt")
        ),
        "the prepare failure message"
    );
    assert!(
        worktree_support::branches(&repo.path).is_empty(),
        "no branch"
    );
    assert!(worktrees(&repo.path).is_empty(), "no worktree");
    assert!(
        !repo.worktree_folder("001-alpha-twice").exists(),
        "no worktree folder"
    );
    assert!(
        repo.path.join("openspec/changes/001-alpha-twice").is_dir(),
        "the checkout copy stays"
    );
    assert_eq!(
        record_lines(&repo),
        vec![
            worktree_support::expected_record("worktree-add", &repo.path),
            worktree_support::expected_record("worktree-prune", &repo.path),
        ],
        "the worktree add and its prune are recorded"
    );

    write_config(
        &repo.path,
        &repo.root.join("worktrees"),
        &["prepare = \"echo prepared > prepared.txt\""],
    );
    let second = approve(&repo.path, &["1"]).expect("the second approve passes");
    let rendered = format!("{}\n", render(&repo, "001-alpha-twice", &Ok(second)));
    let expected = with_rolled_back_record(&golden("prepare-passes-001.txt"));
    assert_eq!(rendered, expected, "the second approval matches the golden");
}

/// Inserts the rolled-back record lines into a passing golden's record section.
fn with_rolled_back_record(golden: &str) -> String {
    let marker = "record:\n";
    let at = golden.find(marker).expect("the golden has a record") + marker.len();
    let insert = format!(
        "{}\n{}\n",
        golden_record("worktree-add"),
        golden_record("worktree-prune")
    );
    format!("{}{insert}{}", &golden[..at], &golden[at..])
}

/// Proves git off approves in the checkout, as "Git off approves in the checkout" says.
///
/// Covers: rust-approve/git-off-approves-in-the-checkout
#[test]
fn git_off_approves_in_the_checkout() {
    let root = scratch_copy("git-off");
    fs::write(
        root.join("osq.toml"),
        "[vcs]\nenabled = false\nauthor = \"Osq Bot <bot@example.com>\"\n",
    )
    .expect("osq.toml is written");
    let result = approve(&root, &["1"]).expect("git off approves in the checkout");
    assert_eq!(
        result.text,
        format!("Approved 001 (001-alpha-twice)\n  Hash: {SEAL}\n"),
        "the two approval lines"
    );
    let marker = fs::read_to_string(root.join("openspec/changes/001-alpha-twice/.run/approved"))
        .expect("the checkout marker is written");
    assert_eq!(marker, format!("{SEAL}\n"), "the checkout marker");
}

/// Proves approval removes the stacked copy of the change.
///
/// Covers: rust-approve/stacked-copy-removed
#[test]
fn stacked_copy_removed() {
    let repo = build("stacked-copy", &[]);
    let stacked = repo.root.join("worktrees/repo/.stacked/001-alpha-twice");
    fs::create_dir_all(&stacked).expect("the stacked folder is created");
    fs::write(stacked.join("note.txt"), "stacked\n").expect("the note is written");
    let result = approve(&repo.path, &["1"]);
    assert!(result.is_ok(), "{:?}", result.err());
    assert!(!stacked.exists(), "the stacked copy is removed");
}

/// Proves an unreadable config is refused before any marker is written.
///
/// Covers: rust-approve/unreadable-config
#[test]
fn unreadable_config() {
    let root = scratch_copy("unreadable-config");
    fs::write(root.join("osq.toml"), "[vcs]\nenabled = \"yes\"\n").expect("osq.toml is written");
    let error = approve(&root, &["1"]).expect_err("the config is refused");
    assert_eq!(
        error.to_string(),
        "approve failed: vcs.enabled must be a boolean",
        "the config error"
    );
    assert!(
        !root.join("openspec/changes/001-alpha-twice/.run").exists(),
        "no marker is written"
    );
}
